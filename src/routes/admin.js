'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { BOOKING_STATUSES } = require('../constants');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const storage = require('../services/storage');
const { imagesByTool, toolDto, labourDto } = require('../services/listings');
const { audit } = require('../utils/audit');
const { notFound, badRequest } = require('../utils/errors');
const { maskPhone } = require('../utils/phone');
const S = require('../utils/schemas');

const router = express.Router();
router.use(requireRole('admin'));

const idParams = z.object({ id: S.id });
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

async function paginate(sql, countSql, args, { page, pageSize }) {
  const { total } = await db.prepare(countSql).get(...args);
  const rows = await db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
  return { total, rows, page, pageSize };
}

/* ------------------------------------------------------------- Stats */

router.get('/stats', async (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const users = await db
    .prepare(`SELECT role, COUNT(*) AS n, SUM(status = 'blocked') AS blocked FROM users WHERE role != 'admin' GROUP BY role`)
    .all();
  const byRole = Object.fromEntries(users.map((u) => [u.role, { total: u.n, blocked: u.blocked || 0 }]));

  const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
  (await db.prepare('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status')
    .all())
    .forEach((r) => { bookingsByStatus[r.status] = r.n; });

  const daily = await db
    .prepare(
      `SELECT created_at::date AS day, COUNT(*) AS n FROM users
        WHERE role != 'admin' AND created_at >= date('now', '-13 days') GROUP BY created_at::date ORDER BY day`
    )
    .all();

  res.json({
    users: {
      farmers: byRole.farmer || { total: 0, blocked: 0 },
      owners: byRole.owner || { total: 0, blocked: 0 },
    },
    tools: {
      total: (await one('SELECT COUNT(*) AS n FROM tools')).n,
      pending: (await one("SELECT COUNT(*) AS n FROM tools WHERE status = 'pending'")).n,
      approved: (await one("SELECT COUNT(*) AS n FROM tools WHERE status = 'approved'")).n,
      rejected: (await one("SELECT COUNT(*) AS n FROM tools WHERE status = 'rejected'")).n,
    },
    labour: {
      total: (await one('SELECT COUNT(*) AS n FROM labour_listings')).n,
      pending: (await one("SELECT COUNT(*) AS n FROM labour_listings WHERE status = 'pending'")).n,
    },
    bookings: {
      total: (await one('SELECT COUNT(*) AS n FROM bookings')).n,
      byStatus: bookingsByStatus,
      completedValue: (await one(
        `SELECT COALESCE(SUM(COALESCE(final_amount, quoted_amount)), 0) AS v FROM bookings WHERE status = 'completed'`
      )).v,
    },
    signupsLast14Days: daily,
    logins24h: (await one(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('auth.login','auth.register') AND created_at >= datetime('now','-1 day')`
    )).n,
  });
});

/* ------------------------------------------------------------- Users */

router.get(
  '/users',
  validate({
    query: z.object({
      role: z.enum(['farmer', 'owner']).optional(),
      status: z.enum(['active', 'blocked']).optional(),
      q: z.string().trim().max(80).optional(),
      ...pageQuery,
    }),
  }),
  async (req, res) => {
    const f = req.valid.query;
    const where = [`u.role != 'admin'`];
    const args = [];
    if (f.role) { where.push('u.role = ?'); args.push(f.role); }
    if (f.status) { where.push('u.status = ?'); args.push(f.status); }
    if (f.q) {
      where.push(`(u.name LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\' OR u.village LIKE ? ESCAPE '\\' OR u.district LIKE ? ESCAPE '\\')`);
      args.push(like(f.q), like(f.q), like(f.q), like(f.q));
    }
    const w = where.join(' AND ');
    const { total, rows } = await paginate(
      `SELECT u.*,
              (SELECT COUNT(*) FROM tools t WHERE t.owner_id = u.id) AS tool_count,
              (SELECT COUNT(*) FROM bookings b WHERE b.farmer_id = u.id OR b.owner_id = u.id) AS booking_count
         FROM users u WHERE ${w} ORDER BY u.created_at DESC`,
      `SELECT COUNT(*) AS total FROM users u WHERE ${w}`,
      args,
      f
    );
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      items: rows.map((u) => ({
        id: u.id, role: u.role, name: u.name, phone: u.phone, village: u.village, district: u.district,
        state: u.state, status: u.status, profileComplete: !!u.profile_complete,
        toolCount: u.tool_count, bookingCount: u.booking_count, createdAt: u.created_at, lastLoginAt: u.last_login_at,
      })),
    });
  }
);

router.get('/users/:id', validate({ params: idParams }), async (req, res) => {
  const u = await db.prepare("SELECT * FROM users WHERE id = ? AND role != 'admin'").get(req.valid.params.id);
  if (!u) throw notFound('User not found');

  const tools = await db
    .prepare('SELECT t.*, NULL AS owner_name, NULL AS owner_business FROM tools t WHERE t.owner_id = ? ORDER BY t.created_at DESC')
    .all(u.id);
  const imgs = await imagesByTool(tools.map((t) => t.id));
  const bookings = await db
    .prepare(
      `SELECT b.id, b.kind, b.item_title, b.status, b.start_date, b.end_date, b.quoted_amount, b.final_amount,
              f.name AS farmer_name, f.phone AS farmer_phone, COALESCE(o.business_name, o.name) AS owner_name, o.phone AS owner_phone
         FROM bookings b JOIN users f ON f.id = b.farmer_id JOIN users o ON o.id = b.owner_id
        WHERE b.farmer_id = ? OR b.owner_id = ? ORDER BY b.created_at DESC LIMIT 100`
    )
    .all(u.id, u.id);
  const recentActivity = await db
    .prepare('SELECT action, entity, entity_id, ip, created_at FROM audit_logs WHERE actor_id = ? ORDER BY id DESC LIMIT 30')
    .all(u.id);

  res.json({
    user: {
      id: u.id, role: u.role, name: u.name, businessName: u.business_name, phone: u.phone, village: u.village,
      district: u.district, state: u.state, address: u.address, lat: u.lat, lng: u.lng, status: u.status,
      createdAt: u.created_at, lastLoginAt: u.last_login_at,
    },
    tools: tools.map((t) => toolDto(t, imgs.get(t.id))),
    bookings,
    recentActivity,
  });
});

router.patch(
  '/users/:id/status',
  validate({ params: idParams, body: z.object({ status: z.enum(['active', 'blocked']), reason: S.text(300) }) }),
  async (req, res) => {
    const u = await db.prepare("SELECT * FROM users WHERE id = ? AND role != 'admin'").get(req.valid.params.id);
    if (!u) throw notFound('User not found');
    const { status, reason } = req.valid.body;
    // Blocking also bumps token_version so existing sessions stop working immediately.
    await db.prepare(
      `UPDATE users SET status = ?, token_version = token_version + 1,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(status, u.id);
    audit(req, status === 'blocked' ? 'admin.user_blocked' : 'admin.user_unblocked', {
      entity: 'user', entityId: u.id, meta: { reason: reason || null, phone: maskPhone(u.phone) },
    });
    res.json({ ok: true, status });
  }
);

/* ------------------------------------------------------ Tool moderation */

const moderationBody = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
  note: S.text(300),
});

router.get(
  '/tools',
  validate({
    query: z.object({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      q: z.string().trim().max(80).optional(),
      ...pageQuery,
    }),
  }),
  async (req, res) => {
    const f = req.valid.query;
    const where = ['1 = 1'];
    const args = [];
    if (f.status) { where.push('t.status = ?'); args.push(f.status); }
    if (f.q) {
      where.push(`(t.name LIKE ? ESCAPE '\\' OR t.brand LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')`);
      args.push(like(f.q), like(f.q), like(f.q), like(f.q));
    }
    const w = where.join(' AND ');
    const { total, rows } = await paginate(
      `SELECT t.*, u.name AS owner_name, u.business_name AS owner_business, u.phone AS owner_phone
         FROM tools t JOIN users u ON u.id = t.owner_id WHERE ${w}
        ORDER BY (t.status = 'pending') DESC, t.created_at DESC`,
      `SELECT COUNT(*) AS total FROM tools t JOIN users u ON u.id = t.owner_id WHERE ${w}`,
      args,
      f
    );
    const imgs = await imagesByTool(rows.map((r) => r.id));
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      items: rows.map((r) => ({ ...toolDto(r, imgs.get(r.id)), ownerPhone: r.owner_phone })),
    });
  }
);

router.patch('/tools/:id/status', validate({ params: idParams, body: moderationBody }), async (req, res) => {
  const t = await db.prepare('SELECT id, name FROM tools WHERE id = ?').get(req.valid.params.id);
  if (!t) throw notFound('Tool not found');
  const { status, note } = req.valid.body;
  if (status === 'rejected' && !note) throw badRequest('Please give a short reason when rejecting a listing');
  await db.prepare(
    `UPDATE tools SET status = ?, admin_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(status, note ?? null, t.id);
  audit(req, `admin.tool_${status}`, { entity: 'tool', entityId: t.id, meta: { name: t.name, note: note || null } });
  res.json({ ok: true, status });
});

router.delete('/tools/:id', validate({ params: idParams }), async (req, res) => {
  const t = await db.prepare('SELECT id, name FROM tools WHERE id = ?').get(req.valid.params.id);
  if (!t) throw notFound('Tool not found');
  await db.prepare('DELETE FROM tools WHERE id = ?').run(t.id);
  audit(req, 'admin.tool_deleted', { entity: 'tool', entityId: t.id, meta: { name: t.name } });
  res.json({ ok: true });
});

/* ---------------------------------------------------- Labour moderation */

router.get(
  '/labour',
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), ...pageQuery }) }),
  async (req, res) => {
    const f = req.valid.query;
    const where = f.status ? 'l.status = ?' : '1 = 1';
    const args = f.status ? [f.status] : [];
    const { total, rows } = await paginate(
      `SELECT l.*, u.name AS owner_name, u.business_name AS owner_business, u.phone AS owner_phone
         FROM labour_listings l JOIN users u ON u.id = l.provider_id WHERE ${where}
        ORDER BY (l.status = 'pending') DESC, l.created_at DESC`,
      `SELECT COUNT(*) AS total FROM labour_listings l WHERE ${where}`,
      args,
      f
    );
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      items: rows.map((r) => ({ ...labourDto(r), providerPhone: r.owner_phone })),
    });
  }
);

router.patch('/labour/:id/status', validate({ params: idParams, body: moderationBody }), async (req, res) => {
  const l = await db.prepare('SELECT id, title FROM labour_listings WHERE id = ?').get(req.valid.params.id);
  if (!l) throw notFound('Labour listing not found');
  const { status, note } = req.valid.body;
  if (status === 'rejected' && !note) throw badRequest('Please give a short reason when rejecting a listing');
  await db.prepare(
    `UPDATE labour_listings SET status = ?, admin_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(status, note ?? null, l.id);
  audit(req, `admin.labour_${status}`, { entity: 'labour', entityId: l.id, meta: { title: l.title, note: note || null } });
  res.json({ ok: true, status });
});

router.delete('/labour/:id', validate({ params: idParams }), async (req, res) => {
  const l = await db.prepare('SELECT id, title FROM labour_listings WHERE id = ?').get(req.valid.params.id);
  if (!l) throw notFound('Labour listing not found');
  await db.prepare('DELETE FROM labour_listings WHERE id = ?').run(l.id);
  audit(req, 'admin.labour_deleted', { entity: 'labour', entityId: l.id, meta: { title: l.title } });
  res.json({ ok: true });
});

/* ------------------------------------------------------------ Bookings */

router.get(
  '/bookings',
  validate({
    query: z.object({
      status: z.enum(BOOKING_STATUSES).optional(),
      kind: z.enum(['tool', 'labour']).optional(),
      q: z.string().trim().max(80).optional(),
      ...pageQuery,
    }),
  }),
  async (req, res) => {
    const f = req.valid.query;
    const where = ['1 = 1'];
    const args = [];
    if (f.status) { where.push('b.status = ?'); args.push(f.status); }
    if (f.kind) { where.push('b.kind = ?'); args.push(f.kind); }
    if (f.q) {
      where.push(`(b.item_title LIKE ? ESCAPE '\\' OR fu.name LIKE ? ESCAPE '\\' OR ou.name LIKE ? ESCAPE '\\' OR fu.phone LIKE ? ESCAPE '\\' OR ou.phone LIKE ? ESCAPE '\\')`);
      args.push(like(f.q), like(f.q), like(f.q), like(f.q), like(f.q));
    }
    const w = where.join(' AND ');
    const from = `FROM bookings b JOIN users fu ON fu.id = b.farmer_id JOIN users ou ON ou.id = b.owner_id`;
    const { total, rows } = await paginate(
      `SELECT b.id, b.kind, b.item_title, b.status, b.start_date, b.end_date, b.land_acres, b.quoted_amount,
              b.final_amount, b.rating, b.created_at, b.completed_at,
              fu.id AS farmer_id, fu.name AS farmer_name, fu.phone AS farmer_phone,
              ou.id AS owner_id, COALESCE(ou.business_name, ou.name) AS owner_name, ou.phone AS owner_phone
         ${from} WHERE ${w} ORDER BY b.created_at DESC, b.id DESC`,
      `SELECT COUNT(*) AS total ${from} WHERE ${w}`,
      args,
      f
    );
    res.json({ total, page: f.page, pageSize: f.pageSize, items: rows });
  }
);

/* ------------------------------------------------------------ Audit log */

router.get(
  '/audit',
  validate({
    query: z.object({
      action: z.string().trim().max(60).optional(),
      actorId: S.id.optional(),
      ...pageQuery,
    }),
  }),
  async (req, res) => {
    const f = req.valid.query;
    const where = ['1 = 1'];
    const args = [];
    if (f.action) { where.push(`a.action LIKE ? ESCAPE '\\'`); args.push(`${f.action.replace(/[\\%_]/g, '\\$&')}%`); }
    if (f.actorId) { where.push('a.actor_id = ?'); args.push(f.actorId); }
    const w = where.join(' AND ');
    const { total, rows } = await paginate(
      `SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ${w} ORDER BY a.id DESC`,
      `SELECT COUNT(*) AS total FROM audit_logs a WHERE ${w}`,
      args,
      f
    );
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      items: rows.map((r) => ({
        id: r.id, actorId: r.actor_id, actorRole: r.actor_role, actorName: r.actor_name, action: r.action,
        entity: r.entity, entityId: r.entity_id, meta: r.meta ? JSON.parse(r.meta) : null, ip: r.ip, createdAt: r.created_at,
      })),
    });
  }
);

/* ---------------------------------------------------------------- Crops */

const cropBody = z.object({
  name: S.requiredText(80, 2),
  yieldPerAcreKg: z.coerce.number().positive().max(1_000_000),
  defaultPricePerQuintal: S.money,
  notes: S.text(200),
  active: S.bool.default(true),
});

router.get('/crops', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM crops ORDER BY name').all();
  res.json({
    items: rows.map((c) => ({
      id: c.id, name: c.name, yieldPerAcreKg: c.yield_per_acre_kg,
      defaultPricePerQuintal: c.default_price_per_quintal, notes: c.notes, active: !!c.active,
    })),
  });
});

router.post('/crops', validate({ body: cropBody }), async (req, res) => {
  const b = req.valid.body;
  const info = await db
    .prepare('INSERT INTO crops (name, yield_per_acre_kg, default_price_per_quintal, notes, active) VALUES (?, ?, ?, ?, ?)')
    .run(b.name, b.yieldPerAcreKg, b.defaultPricePerQuintal ?? null, b.notes ?? null, b.active ? 1 : 0);
  audit(req, 'admin.crop_created', { entity: 'crop', entityId: info.lastInsertRowid, meta: { name: b.name } });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/crops/:id', validate({ params: idParams, body: cropBody }), async (req, res) => {
  const b = req.valid.body;
  const info = await db
    .prepare('UPDATE crops SET name = ?, yield_per_acre_kg = ?, default_price_per_quintal = ?, notes = ?, active = ? WHERE id = ?')
    .run(b.name, b.yieldPerAcreKg, b.defaultPricePerQuintal ?? null, b.notes ?? null, b.active ? 1 : 0, req.valid.params.id);
  if (!info.changes) throw notFound('Crop not found');
  audit(req, 'admin.crop_updated', { entity: 'crop', entityId: req.valid.params.id, meta: { name: b.name } });
  res.json({ ok: true });
});

module.exports = router;
