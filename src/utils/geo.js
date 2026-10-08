'use strict';

const EARTH_RADIUS_KM = 6371.0088;
const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;

const SQM_PER_ACRE = 4046.8564224;
const SQM_PER_GUNTA = SQM_PER_ACRE / 40; // 1 acre = 40 guntas (Telangana / Karnataka / Maharashtra)
const SQM_PER_HECTARE = 10000;
const SQFT_PER_SQM = 10.7639104167;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bounding box that fully contains a circle, used to pre-filter rows with an index. */
function boundingBox(lat, lng, radiusKm) {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cos = Math.max(0.01, Math.cos(toRad(lat)));
  const dLng = dLat / cos;
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLng: Math.max(-180, lng - dLng),
    maxLng: Math.min(180, lng + dLng),
  };
}

/**
 * Geodesic area of a polygon on a sphere (square metres).
 * Uses the same spherical-excess formulation as Turf / Mapbox "geodesic area".
 * `points` is an array of {lat, lng}; the ring is closed automatically.
 */
function polygonAreaSqm(points) {
  const n = points.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    total += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

function polygonPerimeterM(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;
  }
  return sum;
}

/** Split an area in sq m into whole acres + guntas (+ remainder) for the Indian display convention. */
function acresAndGuntas(sqm) {
  const totalAcres = sqm / SQM_PER_ACRE;
  const wholeAcres = Math.floor(totalAcres + 1e-9);
  const guntas = (totalAcres - wholeAcres) * 40;
  return { acres: wholeAcres, guntas: Number(guntas.toFixed(2)), totalAcres: Number(totalAcres.toFixed(4)) };
}

module.exports = {
  EARTH_RADIUS_KM,
  SQM_PER_ACRE,
  SQM_PER_GUNTA,
  SQM_PER_HECTARE,
  SQFT_PER_SQM,
  haversineKm,
  boundingBox,
  polygonAreaSqm,
  polygonPerimeterM,
  acresAndGuntas,
};
