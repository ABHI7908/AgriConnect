// Key-free Leaflet maps shared by marketplace, listing location pickers, and land measurement.
import { getMeta } from './session.js';
import { getPosition, explainGeoError } from './geo.js';
import { toast } from './dom.js';

export const DEFAULT_CENTER = [17.385, 78.4867];

function point(position) {
  return Array.isArray(position) ? position : [position.lat, position.lng];
}

export function mapClickPosition(event) {
  return { lat: event.latlng.lat, lng: event.latlng.lng };
}

export function markerPosition(marker) {
  const position = marker.getLatLng();
  return { lat: position.lat, lng: position.lng };
}

export function mapSetView(map, position, zoom) {
  map.setView(point(position), Number.isFinite(zoom) ? zoom : map.getZoom());
}

export function removeOverlay(overlay) {
  overlay?.remove();
}

function markerIcon(kind = 'tool') {
  if (kind === 'you') {
    return window.L.divIcon({ className: 'you-dot', html: '', iconSize: [18, 18], iconAnchor: [9, 9] });
  }
  if (kind === 'vertex' || kind === 'first') {
    return window.L.divIcon({
      className: `vertex${kind === 'first' ? ' first' : ''}`,
      html: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  return window.L.divIcon({
    className: `pin${kind === 'labour' ? ' labour' : ''}`,
    html: '<span></span>',
    iconSize: [32, 32],
    iconAnchor: [13, 26],
  });
}

export async function createMap(el, { center = DEFAULT_CENTER, zoom = 9, satellite = false, layers = true } = {}) {
  const L = window.L;
  const meta = await getMeta();
  const mapConfig = meta.map;
  const street = L.tileLayer(mapConfig.street.url, { attribution: mapConfig.street.attribution, maxZoom: 19 });
  const imagery = L.tileLayer(mapConfig.satellite.url, { attribution: mapConfig.satellite.attribution, maxZoom: 19 });
  const map = L.map(el, { zoomControl: true }).setView(point(center), zoom);
  const baseLayers = { Street: street, Satellite: imagery };
  (satellite ? imagery : street).addTo(map);
  if (layers) L.control.layers(baseLayers, null, { collapsed: true }).addTo(map);
  return map;
}

export function createMarker(map, { position, kind = 'tool', draggable = false, title = '' } = {}) {
  return window.L.marker(point(position), { icon: markerIcon(kind), draggable, title }).addTo(map);
}

export function createCircle(map, { center, radius, strokeColor = '#2d6a9f', strokeWeight = 1, fillOpacity = 0.12 } = {}) {
  return window.L.circle(point(center), {
    radius,
    color: strokeColor,
    weight: strokeWeight,
    fillColor: strokeColor,
    fillOpacity,
    interactive: false,
  }).addTo(map);
}

export function createPolyline(map, path, options = {}) {
  return window.L.polyline(path.map(point), {
    color: options.color || '#f2a900',
    weight: options.weight || 3,
    interactive: false,
  }).addTo(map);
}

export function createPolygon(map, path, options = {}) {
  return window.L.polygon(path.map(point), {
    color: options.color || '#f2a900',
    weight: options.weight || 3,
    fillColor: options.fillColor || '#f2a900',
    fillOpacity: options.fillOpacity ?? 0.25,
    interactive: false,
  }).addTo(map);
}

/** A point picker with click-to-place, draggable pin, and GPS support. */
export async function locationPicker(el, { lat, lng, onChange, zoom = 12 } = {}) {
  const has = Number.isFinite(lat) && Number.isFinite(lng);
  const map = await createMap(el, { center: has ? [lat, lng] : DEFAULT_CENTER, zoom: has ? 15 : zoom });
  let marker = null;
  let value = has ? { lat, lng } : null;

  async function place(pt, fly = true) {
    value = pt;
    if (!marker) {
      marker = createMarker(map, { position: pt, kind: 'tool', draggable: true, title: 'Listing location' });
      marker.on('dragend', () => {
        value = markerPosition(marker);
        if (onChange) onChange(value);
      });
    } else {
      marker.setLatLng(point(pt));
    }
    if (fly) map.setView(point(pt), Math.max(map.getZoom(), 15));
    if (onChange) onChange(value);
  }

  if (has) await place(value, false);
  map.on('click', (event) => place(mapClickPosition(event), false));

  async function useGps() {
    try {
      const position = await getPosition();
      await place({ lat: position.lat, lng: position.lng });
      return position;
    } catch (err) {
      toast(explainGeoError(err), 'error', 6000);
      return null;
    }
  }

  return {
    map,
    get: () => value,
    set: (latitude, longitude) => place({ lat: latitude, lng: longitude }),
    useGps,
    refresh: () => map.invalidateSize(),
  };
}
