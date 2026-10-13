'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { TOOL_CATEGORY_IDS } = require('../constants');
const { validate } = require('../middleware/validate');
const { requireRole, requireCompleteProfile } = require('../middleware/auth');
const { uploadImages } = require('../middleware/upload');
const limits = require('../middleware/rateLimit');
const storage = require('../services/storage');
const { searchNearest, imagesByTool, ratingsFor, toolDto, forViewer, moderatedFieldsChanged } = require('../services/listings');
const { audit } = require('../utils/audit');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
const S = require('../utils/schemas');

const router = express.Router();

/* ------------------------------------------------------------- Schemas */

const optionalInt = (min, max) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional()
  );

const toolBody = z
  .object({
    category: z.enum(TOOL_CATEGORY_IDS),
    name: S.requiredText(100),
    brand: S.text(60),
    model: S.text(60),
    year: optionalInt(1970, new Date().getFullYear() + 1),
    description: S.text(2000),
    pricePerHour: S.money,
    pricePerDay: S.money,
    pricePerAcre: S.money,
    withOperator: S.bool.default(false),
    village: S.text(80),
    district: S.text(80),
    state: S.text(80),
    address: S.text(300),
    lat: S.lat,
    lng: S.lng,
    serviceRadiusKm: z.coerce.number().min(1).max(500).default(25),
    removeImageIds: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
        z.array(z.coerce.number().int().positive()).max(20)
      )
      .optional(),
  })
  .refine((v) => v.pricePerHour || v.pricePerDay || v.pricePerAcre, {
    message: 'Add at least one price (per hour, per day or per acre)',
    path: ['pricePerDay'],
  });

const searchQuery = z.object({
  lat: S.lat.optional(),
  lng: S.lng.optional(),
  radiusKm: z.coerce.number().min(1).max(1000).default(50),
  category: z.enum(TOOL_CATEGORY_IDS).optional(),
  q: z.string().trim().max(80).optional(),
  maxPricePerDay: z.coerce.number().min(0).optional(),
  withOperator: z.enum(['1', '0']).optional(),
  sort: z.enum(['distance', 'newest', 'price_low', 'price_high']).default('distance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const idParams = z.object({ id: S.id });

/* ------------------------------------------------------------- Helpers */

const getTool = (id) => db.prepare('SELECT * FROM tools WHERE id = ?').get(id);

async function ownTool(req) {
  const tool = await getTool(req.valid.params.id);
  if (!tool) throw notFound('Tool not found');
  if (tool.owner_id !== req.user.id) throw forbidden('This listing belongs to another owner');
  return tool;
}

async function fullTool(id) {
  const row = await db
    .prepare(
      `SELECT t.*, u.name AS owner_name, u.business_name AS owner_business
         FROM tools t JOIN users u ON u.id = t.owner_id WHERE t.id = ?`
    )
    .get(id);
  if (!row) return null;
  const images = (await imagesByTool([id])).get(id) || [];
  const rating = (await ratingsFor('tool_id', [id])).get(id);
  return toolDto(row, images, rating);
}

async function saveUploads(files) {
  const saved = [];
  for (const f of files || []) saved.push(storage.saveImage(f.buffer, f.originalname));
  return saved;
}

async function insertImages(toolId, saved) {
  const { next } = await db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tool_images WHERE tool_id = ?')
    .get(toolId);
  const stmt = db.prepare(
    'INSERT INTO tool_images (tool_id, filename, mime, size_bytes, position, data) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const [index, image] of saved.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await stmt.run(toolId, image.filename, image.mime, image.size, next + index, image.data);
  }
}

// Text that other users read; changing any of it on an approved listing sends it back to moderation.
const MODERATED_TOOL_FIELDS = [
  ['category', 'category'], ['name', 'name'], ['brand', 'brand'], ['model', 'model'], ['year', 'year'],
  ['description', 'description'], ['village', 'village'], ['district', 'district'], ['state', 'state'],
  ['address', 'address'],
];

const initialStatus = () => (config.LISTINGS_REQUIRE_APPROVAL ? 'pending' : 'approved');

/* --------------------------------------------------------- Public search */

router.get('/', validate({ query: searchQuery }), async (req, res) => {
  const f = req.valid.query;
  const filters = [];
  const params = [];

  if (f.category) {
    filters.push('x.category = ?');
    params.push(f.category);
  }
  if (f.q) {
    filters.push(`(x.name LIKE ? ESCAPE '\\' OR x.brand LIKE ? ESCAPE '\\' OR x.model LIKE ? ESCAPE '\\')`);
    const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(like, like, like);
  }
  if (f.maxPricePerDay !== undefined) {
    filters.push('(x.price_per_day IS NULL OR x.price_per_day <= ?)');
    params.push(f.maxPricePerDay);
  }
  if (f.withOperator) {
    filters.push('x.with_operator = ?');
    params.push(Number(f.withOperator));
  }

  const { total, items, hasLocation } = await searchNearest({
    table: 'tools',
    ownerCol: 'owner_id',
    filters,
    params,
    lat: f.lat,
    lng: f.lng,
    radiusKm: f.radiusKm,
    sort: f.sort,
    page: f.page,
    pageSize: f.pageSize,
  });

  const ids = items.map((i) => i.id);
  const imgs = await imagesByTool(ids);
  const ratings = await ratingsFor('tool_id', ids);

  res.json({
    total,
    page: f.page,
    pageSize: f.pageSize,
    locationUsed: hasLocation,
    items: items.map((r) => forViewer(toolDto(r, imgs.get(r.id), ratings.get(r.id)), req.user, 'ownerId')),
  });
});

/* --------------------------------------------------------- Owner: mine */

router.get('/mine/list', requireRole('owner'), async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT t.*, u.name AS owner_name, u.business_name AS owner_business
         FROM tools t JOIN users u ON u.id = t.owner_id
        WHERE t.owner_id = ? ORDER BY t.created_at DESC`
    )
    .all(req.user.id);
  const ids = rows.map((r) => r.id);
  const imgs = await imagesByTool(ids);
  const ratings = await ratingsFor('tool_id', ids);
  res.json({ items: rows.map((r) => toolDto(r, imgs.get(r.id), ratings.get(r.id))) });
});

/* ------------------------------------------------------------- Detail */

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const tool = await fullTool(req.valid.params.id);
  if (!tool) throw notFound('Tool not found');

  const viewer = req.user;
  const canSeeUnapproved = viewer && (viewer.role === 'admin' || viewer.id === tool.ownerId);
  if (tool.status !== 'approved' && !canSeeUnapproved) throw notFound('Tool not found');

  const reviewRows = await db
    .prepare(
      `SELECT b.rating, b.review, b.completed_at, u.name AS farmer_name
         FROM bookings b JOIN users u ON u.id = b.farmer_id
        WHERE b.tool_id = ? AND b.rating IS NOT NULL
        ORDER BY b.completed_at DESC LIMIT 10`
    )
    .all(tool.id);
  const reviews = reviewRows.map((r) => ({
      rating: r.rating,
      review: r.review,
      date: r.completed_at,
      farmer: (r.farmer_name || 'Farmer').split(' ')[0],
    }));

  res.json({ tool: forViewer(tool, viewer, 'ownerId'), reviews });
});

/* ---------------------------------------------------------- Owner: CRUD */

router.post(
  '/',
  requireRole('owner'),
  requireCompleteProfile,
  limits.upload,
  uploadImages,
  validate({ body: toolBody }),
  async (req, res) => {
    const b = req.valid.body;
    if (!req.files || req.files.length === 0) throw badRequest('Please upload at least one photo of the machine');

    const saved = await saveUploads(req.files);
    let toolId;
    try {
      toolId = await db.transaction(async () => {
        const info = await db
          .prepare(
            `INSERT INTO tools (owner_id, category, name, brand, model, year, description,
                price_per_hour, price_per_day, price_per_acre, with_operator,
                village, district, state, address, lat, lng, service_radius_km, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            req.user.id, b.category, b.name, b.brand ?? null, b.model ?? null, b.year ?? null,
            b.description ?? null, b.pricePerHour ?? null, b.pricePerDay ?? null, b.pricePerAcre ?? null,
            b.withOperator ? 1 : 0, b.village ?? null, b.district ?? null, b.state ?? null,
            b.address ?? null, b.lat, b.lng, b.serviceRadiusKm, initialStatus()
          );
        await insertImages(info.lastInsertRowid, saved);
        return info.lastInsertRowid;
      })();
    } catch (err) {
      throw err;
    }

    audit(req, 'tool.created', { entity: 'tool', entityId: toolId, meta: { name: b.name, category: b.category } });
    res.status(201).json({ tool: await fullTool(toolId) });
  }
);

router.put(
  '/:id',
  requireRole('owner'),
  limits.upload,
  uploadImages,
  validate({ params: idParams, body: toolBody }),
  async (req, res) => {
    const tool = await ownTool(req);
    const b = req.valid.body;

    const existing = await db.prepare('SELECT id FROM tool_images WHERE tool_id = ?').all(tool.id);
    const toRemove = existing.filter((i) => (b.removeImageIds || []).includes(i.id));
    const newCount = req.files ? req.files.length : 0;
    const finalCount = existing.length - toRemove.length + newCount;

    if (finalCount < 1) throw badRequest('A listing needs at least one photo');
    if (finalCount > config.MAX_IMAGES_PER_LISTING) {
      throw badRequest(`A listing can have at most ${config.MAX_IMAGES_PER_LISTING} photos`);
    }

    const saved = await saveUploads(req.files);
    // New photos or edited public text on an approved listing go back through moderation when approval is required.
    // A rejected listing that the owner edits and saves is resubmitted for review.
    const needsReview =
      config.LISTINGS_REQUIRE_APPROVAL &&
      (tool.status === 'rejected' ||
        (tool.status === 'approved' && (newCount > 0 || moderatedFieldsChanged(tool, b, MODERATED_TOOL_FIELDS))));

    try {
      await db.transaction(async () => {
        await db.prepare(
          `UPDATE tools SET category=?, name=?, brand=?, model=?, year=?, description=?,
                  price_per_hour=?, price_per_day=?, price_per_acre=?, with_operator=?,
                  village=?, district=?, state=?, address=?, lat=?, lng=?, service_radius_km=?,
                  status = CASE WHEN ? = 1 THEN 'pending' ELSE status END,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?`
        ).run(
          b.category, b.name, b.brand ?? null, b.model ?? null, b.year ?? null, b.description ?? null,
          b.pricePerHour ?? null, b.pricePerDay ?? null, b.pricePerAcre ?? null, b.withOperator ? 1 : 0,
          b.village ?? null, b.district ?? null, b.state ?? null, b.address ?? null, b.lat, b.lng,
          b.serviceRadiusKm, needsReview ? 1 : 0, tool.id
        );
        if (toRemove.length) {
          await db.prepare(`DELETE FROM tool_images WHERE id IN (${toRemove.map(() => '?').join(',')})`).run(
            ...toRemove.map((i) => i.id)
          );
        }
        if (saved.length) await insertImages(tool.id, saved);
      })();
    } catch (err) {
      throw err;
    }

    audit(req, 'tool.updated', { entity: 'tool', entityId: tool.id });
    res.json({ tool: await fullTool(tool.id) });
  }
);

router.patch(
  '/:id/availability',
  requireRole('owner'),
  validate({ params: idParams, body: z.object({ available: S.bool }) }),
  async (req, res) => {
    const tool = await ownTool(req);
    await db.prepare(
      `UPDATE tools SET available = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(req.valid.body.available ? 1 : 0, tool.id);
    audit(req, 'tool.availability', { entity: 'tool', entityId: tool.id, meta: { available: req.valid.body.available } });
    res.json({ tool: await fullTool(tool.id) });
  }
);

router.delete('/:id', requireRole('owner'), validate({ params: idParams }), async (req, res) => {
  const tool = await ownTool(req);
  const { n } = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings WHERE tool_id = ? AND status IN ('requested','accepted','in_progress')`
    )
    .get(tool.id);
  if (n > 0) throw conflict('This tool has open bookings. Complete or cancel them before deleting the listing.');

  await db.prepare('DELETE FROM tools WHERE id = ?').run(tool.id);
  audit(req, 'tool.deleted', { entity: 'tool', entityId: tool.id, meta: { name: tool.name } });
  res.json({ ok: true });
});

module.exports = router;
