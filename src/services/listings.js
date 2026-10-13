'use strict';

const db = require('../db');
const { boundingBox, EARTH_RADIUS_KM } = require('../utils/geo');
const { imageDto, round } = require('../utils/serializers');

const PRICE_SQL = {
  tools: 'COALESCE(x.price_per_day, x.price_per_hour, x.price_per_acre)',
  labour_listings: 'x.wage_per_day',
};

/**
 * Shared "find nearest" search used by both machinery and labour listings.
 * Distance filtering, sorting and pagination all happen in SQL, so memory use and latency do not
 * grow with the number of listings. `table` and `ownerCol` are hard-coded by callers (never user input).
 */
async function searchNearest({ table, ownerCol, filters = [], params = [], lat, lng, radiusKm, sort, page, pageSize }) {
  const priceSql = PRICE_SQL[table];
  if (!priceSql) throw new Error(`searchNearest: unsupported table ${table}`);

  const where = [`x.status = 'approved'`, `x.available = 1`, `u.status = 'active'`, ...filters];
  const whereArgs = [...params];
  const hasLocation = lat !== undefined && lng !== undefined;

  let distanceSql = 'NULL::float8';
  const selectArgs = [];
  if (hasLocation) {
    const box = boundingBox(lat, lng, radiusKm);
    where.push('x.lat BETWEEN ? AND ?', 'x.lng BETWEEN ? AND ?');
    whereArgs.push(box.minLat, box.maxLat, box.minLng, box.maxLng);
    distanceSql = `${EARTH_RADIUS_KM * 2} * ASIN(LEAST(1, SQRT(
        POWER(SIN(RADIANS(x.lat - ?::float8) / 2), 2) +
        COS(RADIANS(?::float8)) * COS(RADIANS(x.lat)) * POWER(SIN(RADIANS(x.lng - ?::float8) / 2), 2))))`;
    selectArgs.push(lat, lat, lng);
  }

  const inner = `
    SELECT x.*, u.name AS owner_name, u.business_name AS owner_business,
           ${distanceSql} AS distance_km, ${priceSql} AS sort_price
      FROM ${table} x JOIN users u ON u.id = x.${ownerCol}
     WHERE ${where.join(' AND ')}`;
  const radiusFilter = hasLocation ? 'WHERE q.distance_km <= ?' : '';
  const baseArgs = [...selectArgs, ...whereArgs, ...(hasLocation ? [radiusKm] : [])];

  const orderBy = {
    distance: 'q.distance_km ASC, q.id DESC',
    newest: 'q.created_at DESC, q.id DESC',
    price_low: 'COALESCE(q.sort_price, 1e18) ASC, q.id DESC',
    price_high: 'COALESCE(q.sort_price, -1) DESC, q.id DESC',
  };
  const effectiveSort = sort === 'distance' && !hasLocation ? 'newest' : sort;

  const { n: total } = await db.prepare(`SELECT COUNT(*) AS n FROM (${inner}) q ${radiusFilter}`).get(...baseArgs);
  const rows = await db
    .prepare(`SELECT q.* FROM (${inner}) q ${radiusFilter} ORDER BY ${orderBy[effectiveSort] || orderBy.newest} LIMIT ? OFFSET ?`)
    .all(...baseArgs, pageSize, (page - 1) * pageSize);

  const items = rows.map(({ sort_price: _price, distance_km: distance, ...rest }) =>
    distance === null || distance === undefined ? rest : { ...rest, distance_km: Number(distance) }
  );
  return { total: Number(total), items, hasLocation };
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

/**
 * Remove data that must not leave the server for the person asking.
 *  - adminNote (internal moderation note) and the street address: owner and admin only.
 *  - exact coordinates: signed-in users only; anonymous visitors get ~1 km precision, which still
 *    places the listing on the map but prevents bulk scraping of exact premises locations.
 */
function forViewer(dto, viewer, ownerKey) {
  if (viewer && (viewer.role === 'admin' || viewer.id === dto[ownerKey])) return dto;
  const { adminNote: _adminNote, address: _address, ...rest } = dto;
  if (viewer) return rest;
  const coarse = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
  return { ...rest, lat: coarse(rest.lat), lng: coarse(rest.lng) };
}

/** True when any of the given fields differs between the stored row (snake_case) and the submitted body (camelCase). */
function moderatedFieldsChanged(row, body, fields) {
  const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());
  return fields.some(([column, key]) => norm(row[column]) !== norm(body[key]));
}

module.exports = { moderatedFieldsChanged, forViewer, searchNearest, imagesByTool, ratingsFor, toolDto, labourDto };
