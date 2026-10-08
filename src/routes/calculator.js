'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { notFound } = require('../utils/errors');
const { SQM_PER_ACRE, SQM_PER_GUNTA, SQM_PER_HECTARE, polygonAreaSqm, polygonPerimeterM, acresAndGuntas } = require('../utils/geo');
const S = require('../utils/schemas');

const router = express.Router();

const AREA_UNITS = {
  acre: SQM_PER_ACRE,
  gunta: SQM_PER_GUNTA,
  hectare: SQM_PER_HECTARE,
};

const cropDto = (c) => ({
  id: c.id,
  name: c.name,
  yieldPerAcreKg: c.yield_per_acre_kg,
  defaultPricePerQuintal: c.default_price_per_quintal,
  notes: c.notes,
});

/** Public: crop list with indicative yields (editable by admins). */
router.get('/crops', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM crops WHERE active = 1 ORDER BY name').all();
  res.json({ items: rows.map(cropDto) });
});

/**
 * Server-side calculator. The browser computes the same thing live; this endpoint exists so the
 * numbers can be verified / reused by other clients (and is what "save" re-validates against).
 */
const calcBody = z.object({
  area: z.coerce.number().positive().max(1_000_000),
  unit: z.enum(['acre', 'gunta', 'hectare']),
  yieldPerAcreKg: z.coerce.number().positive().max(1_000_000),
  bagWeightKg: z.coerce.number().min(1).max(1000),
  pricePerQuintal: S.money,
});

function compute({ area, unit, yieldPerAcreKg, bagWeightKg, pricePerQuintal }) {
  const sqm = area * AREA_UNITS[unit];
  const acres = sqm / SQM_PER_ACRE;
  const totalKg = acres * yieldPerAcreKg;
  const bags = totalKg / bagWeightKg;
  const revenue = pricePerQuintal ? (totalKg / 100) * pricePerQuintal : null;
  return {
    areaAcres: Number(acres.toFixed(4)),
    areaGuntas: Number((acres * 40).toFixed(2)),
    areaHectares: Number((sqm / SQM_PER_HECTARE).toFixed(4)),
    areaSqm: Number(sqm.toFixed(1)),
    totalKg: Number(totalKg.toFixed(1)),
    totalQuintals: Number((totalKg / 100).toFixed(2)),
    totalTonnes: Number((totalKg / 1000).toFixed(3)),
    bags: Number(bags.toFixed(1)),
    wholeBags: Math.floor(bags),
    leftoverKg: Number((totalKg - Math.floor(bags) * bagWeightKg).toFixed(1)),
    revenue: revenue === null ? null : Math.round(revenue),
  };
}

router.post('/calculate', validate({ body: calcBody }), (req, res) => {
  res.json({ result: compute(req.valid.body) });
});

/** Verify a GPS-measured boundary on the server (same geodesic maths as the browser). */
router.post(
  '/measure',
  validate({
    body: z.object({
      points: z.array(z.object({ lat: S.lat, lng: S.lng })).min(3).max(500),
    }),
  }),
  (req, res) => {
    const { points } = req.valid.body;
    const sqm = polygonAreaSqm(points);
    res.json({
      areaSqm: Number(sqm.toFixed(1)),
      areaAcres: Number((sqm / SQM_PER_ACRE).toFixed(4)),
      areaGuntas: Number(((sqm / SQM_PER_ACRE) * 40).toFixed(2)),
      areaHectares: Number((sqm / SQM_PER_HECTARE).toFixed(4)),
      perimeterM: Number(polygonPerimeterM(points).toFixed(1)),
      ...(() => {
        const { acres, guntas } = acresAndGuntas(sqm);
        return { acres, guntas };
      })(),
    });
  }
);

/* ------------------------------------------------ Saved calculations (farmers) */

const saveBody = z.object({
  label: S.requiredText(80, 1),
  crop: S.requiredText(80, 1),
  area: z.coerce.number().positive().max(1_000_000),
  unit: z.enum(['acre', 'gunta', 'hectare']),
  yieldPerAcreKg: z.coerce.number().positive().max(1_000_000),
  bagWeightKg: z.coerce.number().min(1).max(1000),
  pricePerQuintal: S.money,
  polygon: z.array(z.object({ lat: S.lat, lng: S.lng })).min(3).max(500).optional(),
});

router.get('/saved', requireRole('farmer'), async (req, res) => {
  const rows = await db
    .prepare('SELECT * FROM saved_calculations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(req.user.id);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      label: r.label,
      crop: r.crop,
      areaAcres: r.area_acres,
      yieldPerAcreKg: r.yield_per_acre_kg,
      bagWeightKg: r.bag_weight_kg,
      totalKg: r.total_kg,
      bags: r.bags,
      pricePerQuintal: r.price_per_quintal,
      revenue: r.revenue,
      polygon: r.polygon ? JSON.parse(r.polygon) : null,
      createdAt: r.created_at,
    })),
  });
});

router.post('/saved', requireRole('farmer'), validate({ body: saveBody }), async (req, res) => {
  const b = req.valid.body;
  const calc = compute(b);
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM saved_calculations WHERE user_id = ?').get(req.user.id)).n;
  if (count >= 200) {
    // keep storage bounded: drop the oldest when over the cap
    await db.prepare(
      `DELETE FROM saved_calculations WHERE id IN (
         SELECT id FROM saved_calculations WHERE user_id = ? ORDER BY created_at ASC LIMIT ?)`
    ).run(req.user.id, count - 199);
  }
  const info = await db
    .prepare(
      `INSERT INTO saved_calculations (user_id, label, crop, area_acres, yield_per_acre_kg, bag_weight_kg,
              total_kg, bags, price_per_quintal, revenue, polygon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id, b.label, b.crop, calc.areaAcres, b.yieldPerAcreKg, b.bagWeightKg, calc.totalKg, calc.bags,
      b.pricePerQuintal ?? null, calc.revenue, b.polygon ? JSON.stringify(b.polygon) : null
    );
  audit(req, 'calc.saved', { entity: 'calculation', entityId: info.lastInsertRowid });
  res.status(201).json({ id: info.lastInsertRowid, result: calc });
});

router.delete('/saved/:id', requireRole('farmer'), validate({ params: z.object({ id: S.id }) }), async (req, res) => {
  const info = await db
    .prepare('DELETE FROM saved_calculations WHERE id = ? AND user_id = ?')
    .run(req.valid.params.id, req.user.id);
  if (!info.changes) throw notFound('Saved calculation not found');
  res.json({ ok: true });
});

module.exports = router;
