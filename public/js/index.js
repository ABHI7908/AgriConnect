// Marketplace home: search machinery / labour by distance from the farmer's location.
import { api } from './lib/api.js';
import { initPage, getMeta } from './lib/session.js';
import { $, html, setHTML, on, toast, num, esc } from './lib/dom.js';
import { getPosition, explainGeoError, saveLocation, loadLocation } from './lib/geo.js';
import {
  createMap, createMarker, mapClickPosition, markerPosition, mapSetView, removeOverlay, DEFAULT_CENTER,
} from './lib/map.js';
import { toolCard, labourCard, openDetail } from './lib/listing-ui.js';

const PAGE_SIZE = 12;

const state = { mode: 'tools', loc: loadLocation(), page: 1, items: [], total: 0 };
let user = null;
let meta = null;
let map = null;
let youMarker = null;
const listingMarkers = [];
let reqId = 0;

const els = {
  results: $('#results'), title: $('#results-title'), status: $('#loc-status'), more: $('#btn-more'),
  category: $('#f-category'), catLabel: $('#f-category-label'), radius: $('#f-radius'), sort: $('#f-sort'),
  operator: $('#f-operator'), opWrap: $('#op-wrap'),
};

function setStatus(h) { setHTML(els.status, h); }

function fillCategories() {
  const labourMode = state.mode === 'labour';
  els.catLabel.textContent = labourMode ? 'Type of work' : 'Type of machine';
  const list = labourMode ? meta.labourSkills : meta.categories;
  els.category.innerHTML = `<option value="">${labourMode ? 'All work types' : 'All machines'}</option>` +
    list.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
  els.opWrap.classList.toggle('hidden', labourMode);
  els.title.textContent = labourMode ? 'Nearby labour teams' : 'Nearby machinery';
}

async function setLocation(loc, { fly = true, label } = {}) {
  state.loc = { lat: loc.lat, lng: loc.lng };
  saveLocation(state.loc);
  if (youMarker) youMarker.setLatLng([loc.lat, loc.lng]);
  else {
    youMarker = await createMarker(map, { position: loc, kind: 'you', draggable: true, title: 'Your location (drag to adjust)' });
    youMarker.on('dragend', () => {
      const p = markerPosition(youMarker);
      if (p) setLocation(p, { fly: false }).then(() => search(true));
    });
  }
  if (fly) mapSetView(map, loc, 11);
  setStatus(html`Searching from <strong>${label || 'your chosen spot'}</strong>. Drag the blue dot or tap the map to change it.`);
}

function renderMarkers() {
  listingMarkers.forEach(removeOverlay);
  listingMarkers.length = 0;
  state.items.forEach((it) => {
    if (it.lat == null || it.lng == null) return;
    const marker = createMarker(map, {
      position: { lat: it.lat, lng: it.lng },
      kind: state.mode === 'labour' ? 'labour' : 'tool',
      title: it.name || it.title,
    });
    const wrap = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = it.name || it.title;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.style.marginTop = '.4rem';
    btn.textContent = 'View details';
    btn.addEventListener('click', () => openDetail(state.mode === 'labour' ? 'labour' : 'tool', it.id, user));
    const direction = document.createElement('a');
    direction.className = 'btn small ghost';
    direction.style.margin = '.4rem 0 0 .35rem';
    direction.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${it.lat},${it.lng}`)}`;
    direction.target = '_blank';
    direction.rel = 'noopener noreferrer';
    direction.textContent = 'Open in Google Maps';
    wrap.append(name, document.createElement('br'), btn, direction);
    marker.bindPopup(wrap);
    listingMarkers.push(marker);
  });
  const pts = state.items.filter((i) => i.lat != null).map((i) => [i.lat, i.lng]);
  if (state.loc) pts.push([state.loc.lat, state.loc.lng]);
  if (pts.length > 1 && state.page === 1) {
    map.fitBounds(window.L.latLngBounds(pts), { padding: [30, 30], maxZoom: 13 });
  }
}

function renderResults() {
  const card = state.mode === 'labour' ? labourCard : toolCard;
  if (!state.items.length) {
    setHTML(els.results, html`<div class="empty" style="grid-column:1/-1"><h3>Nothing found nearby</h3>
      <p>Try a larger distance, a different type, or move the blue dot to another spot.</p></div>`);
  } else {
    setHTML(els.results, state.items.map((it) => card(it, meta)));
  }
  els.more.classList.toggle('hidden', state.items.length >= state.total);
  const noun = state.mode === 'labour' ? 'labour team' : 'machine';
  els.title.textContent = `${num(state.total)} ${noun}${state.total === 1 ? '' : 's'} ${state.loc ? 'near you' : 'listed'}`;
}

async function search(reset = true) {
  const id = ++reqId;
  if (reset) {
    state.page = 1;
    state.items = [];
    setHTML(els.results, html`<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`);
  }
  const q = {
    lat: state.loc?.lat, lng: state.loc?.lng, radiusKm: els.radius.value,
    sort: els.sort.value, page: state.page, pageSize: PAGE_SIZE,
  };
  if (state.mode === 'labour') q.skill = els.category.value;
  else { q.category = els.category.value; if (els.operator.checked) q.withOperator = '1'; }
  try {
    const data = await api.get(state.mode === 'labour' ? '/labour' : '/tools', q);
    if (id !== reqId) return; // a newer search superseded this one
    state.items = reset ? data.items : state.items.concat(data.items);
    state.total = data.total;
    renderResults();
    await renderMarkers();
  } catch (err) {
    if (id !== reqId) return;
    setHTML(els.results, html`<div class="empty" style="grid-column:1/-1"><h3>Could not load listings</h3><p>${err.message}</p></div>`);
  }
}

async function locate(btn) {
  btn.disabled = true;
  setStatus('Finding your location…');
  try {
    const p = await getPosition();
    await setLocation(p, { label: `your GPS location (±${Math.round(p.accuracy)} m)` });
    await search(true);
  } catch (err) {
    setStatus(explainGeoError(err));
    toast(explainGeoError(err), 'error', 6000);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  [user, meta] = await Promise.all([initPage('home', { requireUser: true }), getMeta()]);
  map = await createMap($('#map'), { center: state.loc ? [state.loc.lat, state.loc.lng] : DEFAULT_CENTER, zoom: state.loc ? 11 : 6 });
  fillCategories();

  if (state.loc) await setLocation(state.loc, { fly: false, label: 'your last chosen spot' });

  map.on('click', (e) => {
    const loc = mapClickPosition(e);
    setLocation(loc, { fly: false, label: 'the spot you tapped' }).then(() => search(true));
  });
  $('#btn-locate').addEventListener('click', (e) => locate(e.currentTarget));
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); search(true); });
  [els.category, els.radius, els.sort, els.operator].forEach((el) => el.addEventListener('change', () => search(true)));
  document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.segmented button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    state.mode = b.dataset.mode;
    fillCategories();
    search(true);
  }));
  els.more.addEventListener('click', () => { state.page += 1; search(false); });
  on(els.results, 'click', '.listing', (e, el) => {
    if (e.target.closest('.open-map')) return;
    openDetail(el.dataset.kind, Number(el.dataset.id), user);
  });

  await search(true);
}

init().catch((err) => {
  console.error(err);
  $('#map').classList.add('map-error');
  $('#map').textContent = err.message;
  setHTML(els.results, html`<div class="empty" style="grid-column:1/-1"><h3>Something went wrong</h3><p>${err.message}</p></div>`);
});
