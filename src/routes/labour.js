'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { LABOUR_SKILL_IDS } = require('../constants');
const { validate } = require('../middleware/validate');
const { requireRole, requireCompleteProfile } = require('../middleware/auth');
const { searchNearest, ratingsFor, labourDto, forViewer, moderatedFieldsChanged } = require('../services/listings');
const { audit } = require('../utils/audit');
const { notFound, conflict, forbidden } = require('../utils/errors');
const S = require('../utils/schemas');

const router = express.Router();

const labourBody = z.object({
  title: S.requiredText(100),
  skill: z.enum(LABOUR_SKILL_IDS),
  teamSize: z.coerce.number().int().min(1).max(500),
  wagePerDay: z.coerce.number().min(1).max(100000),
  description: S.text(1500),
  village: S.text(80),
  district: S.text(80),
  state: S.text(80),
  address: S.text(300),
  lat: S.lat,
  lng: S.lng,
  serviceRadiusKm: z.coerce.number().min(1).max(500).default(25),
});

const searchQuery = z.object({
  lat: S.lat.optional(),
  lng: S.lng.optional(),
  radiusKm: z.coerce.number().min(1).max(1000).default(50),
  skill: z.enum(LABOUR_SKILL_IDS).optional(),
  minTeamSize: z.coerce.number().int().min(1).optional(),
  maxWage: z.coerce.number().min(0).optional(),
  sort: z.enum(['distance', 'newest', 'price_low', 'price_high']).default('distance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const idParams = z.object({ id: S.id });

// Text that other users read; changing any of it on an approved listing sends it back to moderation.
const MODERATED_LABOUR_FIELDS = [
  ['title', 'title'], ['skill', 'skill'], ['description', 'description'],
  ['village', 'village'], ['district', 'district'], ['state', 'state'], ['address', 'address'],
];

const initialStatus = () => (config.LISTINGS_REQUIRE_APPROVAL ? 'pending' : 'approved');

const fullLabour = async (id) => {
  const row = await db
    .prepare(
      `SELECT l.*, u.name AS owner_name, u.business_name AS owner_business
         FROM labour_listings l JOIN users u ON u.id = l.provider_id WHERE l.id = ?`
    )
    .get(id);
  return row ? labourDto(row, (await ratingsFor('labour_id', [id])).get(id)) : null;
};

async function ownListing(req) {
  const row = await db.prepare('SELECT * FROM labour_listings WHERE id = ?').get(req.valid.params.id);
  if (!row) throw notFound('Labour listing not found');
  if (row.provider_id !== req.user.id) throw forbidden('This listing belongs to another provider');
  return row;
}

/* ------------------------------------------------------------- Search */

router.get('/', validate({ query: searchQuery }), async (req, res) => {
  const f = req.valid.query;
  const filters = [];
  const params = [];
  if (f.skill) {
    filters.push('x.skill = ?');
    params.push(f.skill);
  }
  if (f.minTeamSize) {
    filters.push('x.team_size >= ?');
    params.push(f.minTeamSize);
  }
  if (f.maxWage !== undefined) {
    filters.push('x.wage_per_day <= ?');
    params.push(f.maxWage);
  }

  const { total, items, hasLocation } = await searchNearest({
    table: 'labour_listings',
    ownerCol: 'provider_id',
    filters,
    params,
    lat: f.lat,
    lng: f.lng,
    radiusKm: f.radiusKm,
    sort: f.sort,
    page: f.page,
    pageSize: f.pageSize,
  });

  const ratings = await ratingsFor('labour_id', items.map((i) => i.id));
  res.json({
    total,
    page: f.page,
    pageSize: f.pageSize,
    locationUsed: hasLocation,
    items: items.map((r) => forViewer(labourDto(r, ratings.get(r.id)), req.user, 'providerId')),
  });
});

router.get('/mine/list', requireRole('owner'), async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT l.*, u.name AS owner_name, u.business_name AS owner_business
         FROM labour_listings l JOIN users u ON u.id = l.provider_id
        WHERE l.provider_id = ? ORDER BY l.created_at DESC`
    )
    .all(req.user.id);
  const ratings = await ratingsFor('labour_id', rows.map((r) => r.id));
  res.json({ items: rows.map((r) => labourDto(r, ratings.get(r.id))) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const item = await fullLabour(req.valid.params.id);
  if (!item) throw notFound('Labour listing not found');
  const viewer = req.user;
  const canSeeUnapproved = viewer && (viewer.role === 'admin' || viewer.id === item.providerId);
  if (item.status !== 'approved' && !canSeeUnapproved) throw notFound('Labour listing not found');
  res.json({ labour: forViewer(item, viewer, 'providerId') });
});

/* ------------------------------------------------------------- CRUD */

router.post('/', requireRole('owner'), requireCompleteProfile, validate({ body: labourBody }), async (req, res) => {
  const b = req.valid.body;
  const info = await db
    .prepare(
      `INSERT INTO labour_listings (provider_id, title, skill, team_size, wage_per_day, description,
              village, district, state, address, lat, lng, service_radius_km, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id, b.title, b.skill, b.teamSize, b.wagePerDay, b.description ?? null,
      b.village ?? null, b.district ?? null, b.state ?? null, b.address ?? null,
      b.lat, b.lng, b.serviceRadiusKm, initialStatus()
    );
  audit(req, 'labour.created', { entity: 'labour', entityId: info.lastInsertRowid, meta: { title: b.title } });
  res.status(201).json({ labour: await fullLabour(info.lastInsertRowid) });
});

router.put('/:id', requireRole('owner'), validate({ params: idParams, body: labourBody }), async (req, res) => {
  const row = await ownListing(req);
  const b = req.valid.body;
  const needsReview =
    config.LISTINGS_REQUIRE_APPROVAL &&
    (row.status === 'rejected' || (row.status === 'approved' && moderatedFieldsChanged(row, b, MODERATED_LABOUR_FIELDS)));
  await db.prepare(
    `UPDATE labour_listings SET title=?, skill=?, team_size=?, wage_per_day=?, description=?,
            village=?, district=?, state=?, address=?, lat=?, lng=?, service_radius_km=?,
            status = CASE WHEN ? = 1 THEN 'pending' ELSE status END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`
  ).run(
    b.title, b.skill, b.teamSize, b.wagePerDay, b.description ?? null,
    b.village ?? null, b.district ?? null, b.state ?? null, b.address ?? null,
    b.lat, b.lng, b.serviceRadiusKm, needsReview ? 1 : 0, row.id
  );
  audit(req, 'labour.updated', { entity: 'labour', entityId: row.id });
  res.json({ labour: await fullLabour(row.id) });
});

router.patch(
  '/:id/availability',
  requireRole('owner'),
  validate({ params: idParams, body: z.object({ available: S.bool }) }),
  async (req, res) => {
    const row = await ownListing(req);
    await db.prepare(
      `UPDATE labour_listings SET available = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(req.valid.body.available ? 1 : 0, row.id);
    audit(req, 'labour.availability', { entity: 'labour', entityId: row.id, meta: { available: req.valid.body.available } });
    res.json({ labour: await fullLabour(row.id) });
  }
);

router.delete('/:id', requireRole('owner'), validate({ params: idParams }), async (req, res) => {
  const row = await ownListing(req);
  const { n } = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings WHERE labour_id = ? AND status IN ('requested','accepted','in_progress')`
    )
    .get(row.id);
  if (n > 0) throw conflict('This listing has open bookings. Complete or cancel them before deleting it.');
  await db.prepare('DELETE FROM labour_listings WHERE id = ?').run(row.id);
  audit(req, 'labour.deleted', { entity: 'labour', entityId: row.id, meta: { title: row.title } });
  res.json({ ok: true });
});

module.exports = router;
