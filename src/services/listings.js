'use strict';

const db = require('../db');
const { haversineKm, boundingBox } = require('../utils/geo');
const { imageDto, round } = require('../utils/serializers');

/**
 * Shared "find nearest" search used by both machinery and labour listings.
 * `table` and `ownerCol` are hard-coded by callers (never user input).
 */
async function searchNearest({ table, ownerCol, filters = [], params = [], lat, lng, radiusKm, sort, page, pageSize, maxRows = 3000 }) {
  const where = [`x.status = 'approved'`, `x.available = 1`, `u.status = 'active'`, ...filters];
  const args = [...params];
  const hasLocation = lat !== undefined && lng !== undefined;

  if (hasLocation) {
    const box = boundingBox(lat, lng, radiusKm);
    where.push('x.lat BETWEEN ? AND ?', 'x.lng BETWEEN ? AND ?');
    args.push(box.minLat, box.maxLat, box.minLng, box.maxLng);
  }

  const rows = await db
    .prepare(
      `SELECT x.*, u.name AS owner_name, u.business_name AS owner_business
         FROM ${table} x JOIN users u ON u.id = x.${ownerCol}
        WHERE ${where.join(' AND ')}
        ORDER BY x.created_at DESC
        LIMIT ${Number(maxRows)}`
    )
    .all(...args);

  let items = rows;
  if (hasLocation) {
    items = rows
      .map((r) => ({ ...r, distance_km: haversineKm(lat, lng, r.lat, r.lng) }))
      .filter((r) => r.distance_km <= radiusKm);
  }

  const sorters = {
    distance: (a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0),
    newest: (a, b) => (a.created_at < b.created_at ? 1 : -1),
    price_low: (a, b) => priceKey(a) - priceKey(b),
    price_high: (a, b) => priceKey(b) - priceKey(a),
  };
  const effectiveSort = sort === 'distance' && !hasLocation ? 'newest' : sort;
  items.sort(sorters[effectiveSort] || sorters.newest);

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { total, items: items.slice(start, start + pageSize), hasLocation };
}

function priceKey(r) {
  const p = r.price_per_day ?? r.wage_per_day ?? r.price_per_hour ?? r.price_per_acre;
  return p == null ? Number.MAX_SAFE_INTEGER : p;
}

async function imagesByTool(toolIds) {
  const map = new Map();
  if (!toolIds.length) return map;
  const rows = await db
    .prepare(
       `SELECT id, tool_id, filename, mime, size_bytes, position, created_at
        FROM tool_images WHERE tool_id IN (${toolIds.map(() => '?').join(',')}) ORDER BY position, id`    )
    .all(...toolIds);
  for (const r of rows) {
    if (!map.has(r.tool_id)) map.set(r.tool_id, []);
    map.get(r.tool_id).push(imageDto(r));
  }
  return map;
}

async function ratingsFor(column, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await db
    .prepare(
      `SELECT ${column} AS ref, ROUND(AVG(rating), 1) AS avg, COUNT(rating) AS n
         FROM bookings WHERE ${column} IN (${ids.map(() => '?').join(',')}) AND rating IS NOT NULL
        GROUP BY ${column}`
    )
    .all(...ids);
  rows.forEach((r) => map.set(r.ref, { average: Number(r.avg), count: r.n }));
  return map;
}

function toolDto(r, images, rating) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_business || r.owner_name || 'Owner',
    category: r.category,
    name: r.name,
    brand: r.brand,
    model: r.model,
    year: r.year,
    description: r.description,
    pricePerHour: r.price_per_hour,
    pricePerDay: r.price_per_day,
    pricePerAcre: r.price_per_acre,
    withOperator: !!r.with_operator,
    village: r.village,
    district: r.district,
    state: r.state,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    serviceRadiusKm: r.service_radius_km,
    available: !!r.available,
    status: r.status,
    adminNote: r.admin_note,
    distanceKm: r.distance_km === undefined ? null : round(r.distance_km, 1),
    images: images || [],
    rating: rating || { average: null, count: 0 },
    createdAt: r.created_at,
  };
}

function labourDto(r, rating) {
  return {
    id: r.id,
    providerId: r.provider_id,
    providerName: r.owner_business || r.owner_name || 'Provider',
    title: r.title,
    skill: r.skill,
    teamSize: r.team_size,
    wagePerDay: r.wage_per_day,
    description: r.description,
    village: r.village,
    district: r.district,
    state: r.state,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    serviceRadiusKm: r.service_radius_km,
    available: !!r.available,
    status: r.status,
    adminNote: r.admin_note,
    distanceKm: r.distance_km === undefined ? null : round(r.distance_km, 1),
    rating: rating || { average: null, count: 0 },
    createdAt: r.created_at,
  };
}

module.exports = { searchNearest, imagesByTool, ratingsFor, toolDto, labourDto };
