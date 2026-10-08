// Browser-side geography helpers. The area maths mirrors src/utils/geo.js on the server.

export const EARTH_RADIUS_M = 6371008.8;
export const SQM_PER_ACRE = 4046.8564224;
export const SQM_PER_GUNTA = SQM_PER_ACRE / 40; // 1 acre = 40 guntas
export const SQM_PER_HECTARE = 10000;
export const SQFT_PER_SQM = 10.7639104167;

const rad = (d) => (d * Math.PI) / 180;

export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Geodesic polygon area in square metres (spherical excess, same as Turf). Points: [{lat,lng}]. */
export function polygonAreaSqm(points) {
  const n = points.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    total += rad(p2.lng - p1.lng) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function perimeterM(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += haversineM(points[i], points[(i + 1) % n]);
  // an open path (fewer than 3 points) has no closing edge
  if (n < 3) sum /= 2;
  return sum;
}

/** True if the closed ring crosses itself (bow-tie), which makes the area wrong. */
export function selfIntersects(points) {
  const n = points.length;
  if (n < 4) return false;
  const ccw = (a, b, c) => (c.lat - a.lat) * (b.lng - a.lng) > (b.lat - a.lat) * (c.lng - a.lng);
  const cross = (a, b, c, d) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (cross(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Break an area in sq m into the units farmers use. */
export function areaBreakdown(sqm) {
  const acresTotal = sqm / SQM_PER_ACRE;
  const wholeAcres = Math.floor(acresTotal + 1e-9);
  const guntas = (acresTotal - wholeAcres) * 40;
  return {
    sqm,
    sqft: sqm * SQFT_PER_SQM,
    acres: acresTotal,
    guntasTotal: acresTotal * 40,
    hectares: sqm / SQM_PER_HECTARE,
    wholeAcres,
    restGuntas: guntas,
  };
}

export const AREA_UNITS = {
  acre: { label: 'Acres', sqm: SQM_PER_ACRE },
  gunta: { label: 'Guntas', sqm: SQM_PER_GUNTA },
  hectare: { label: 'Hectares', sqm: SQM_PER_HECTARE },
};

/* -------------------------------------------------------------- Geolocation */
export function geolocationSupported() {
  return 'geolocation' in navigator;
}

export function explainGeoError(err) {
  if (!err) return 'Could not get your location.';
  if (err.code === 1) return 'Location permission is off. Allow location for this site in your browser settings, or tap the map to choose a spot.';
  if (err.code === 2) return 'Your device could not find its position. Move to an open area or tap the map to choose a spot.';
  if (err.code === 3) return 'Finding your location took too long. Try again or tap the map to choose a spot.';
  return 'Could not get your location.';
}

export function getPosition({ highAccuracy = true, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) { reject(Object.assign(new Error('unsupported'), { code: 2 })); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 15000 }
    );
  });
}

const KEY = 'agri_last_location';
export function saveLocation(loc) {
  try { localStorage.setItem(KEY, JSON.stringify({ lat: loc.lat, lng: loc.lng, label: loc.label || null })); } catch (_) { /* storage may be blocked */ }
}
export function loadLocation() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) return v;
  } catch (_) { /* ignore */ }
  return null;
}

/* ------------------------------------------------- Accuracy / uncertainty */

/** Project lat/lng to local metres (east, north) around a reference point. Good for fields up to a few km. */
export function toLocalMetres(points, ref = points[0]) {
  const cosLat = Math.cos(rad(ref.lat));
  return points.map((p) => ({
    x: rad(p.lng - ref.lng) * EARTH_RADIUS_M * cosLat,
    y: rad(p.lat - ref.lat) * EARTH_RADIUS_M,
  }));
}

/**
 * One-sigma uncertainty (sq m) of a polygon's area when every corner has an independent position error `sigmaM`.
 * Area = 1/2 * sum(x_i * (y_{i+1} - y_{i-1}))  =>  Var = sigma^2 / 4 * sum |p_{i+1} - p_{i-1}|^2
 */
export function areaStdSqm(points, sigmaM) {
  const n = points.length;
  if (n < 3 || !(sigmaM > 0)) return 0;
  const q = toLocalMetres(points);
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const a = q[(i + 1) % n];
    const b = q[(i + n - 1) % n];
    s += (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }
  return Math.sqrt((sigmaM * sigmaM * s) / 4);
}

/** Weighted mean of GPS fixes ({lat,lng,accuracy}); weights 1/accuracy^2. Returns the point and its combined accuracy. */
export function averageFixes(fixes) {
  let w = 0; let lat = 0; let lng = 0;
  fixes.forEach((f) => {
    const wi = 1 / Math.max(1, f.accuracy) ** 2;
    w += wi; lat += f.lat * wi; lng += f.lng * wi;
  });
  // Successive fixes are correlated, so do not claim better than half the best single reading.
  const best = Math.min(...fixes.map((f) => f.accuracy));
  return { lat: lat / w, lng: lng / w, accuracy: Math.max(best / 2, 1 / Math.sqrt(w)) };
}
