// GPS land measurement + crop yield calculator (acres / guntas / hectares, bags of any weight).
import { api } from './lib/api.js';
import { initPage } from './lib/session.js';
import { $, $$, html, setHTML, num, money, toast, withBusy, showFormError } from './lib/dom.js';
import * as G from './lib/geo.js';
import {
  createMap, createMarker, createCircle, createPolyline, createPolygon, mapClickPosition, markerPosition, removeOverlay, mapSetView,
} from './lib/map.js';
const user = await initPage('calculator', { requireUser: true });
const CALCULATOR_FALLBACK_CENTER = [17.4576477, 78.3955979];

/* ================================================================== */
/*  Step 1: measuring land                                            */
/* ================================================================== */

const M = {
  mode: 'walk',
  pts: [], // [{ lat, lng, acc }] acc = 1-sigma horizontal accuracy in metres, if known
  watchId: null,
  fix: null,
  collecting: null,
  markers: [],
  poly: null,
  you: null,
  circle: null,
  map: null,
  measured: null, // { acres, pts } captured when "use this area" is pressed
};
const DRAW_SIGMA_M = 3; // assumed corner placement error when tapping on imagery
const MAX_POINT_ACCURACY_M = 30;
const AVERAGE_SECONDS = 5;

const HELP = {
  walk: 'Press “Start GPS”, stand at one corner of the field and press “Mark corner here”. Walk to the next corner and repeat. Each corner averages 5 seconds of GPS readings for better accuracy. Stay in the open, away from tree cover.',
  draw: 'Tap each corner of your field on the satellite map, in order. Drag a corner to fine-tune it. Zoom in close for the best accuracy.',
};

function setStatus(text, cls = '') {
  const el = $('#gps-status');
  el.textContent = '';
  if (cls) {
    const s = document.createElement('span');
    s.className = `acc ${cls}`;
    s.textContent = text;
    el.append(s);
  } else el.textContent = text;
}

function accClass(a) { return a <= 8 ? 'good' : a <= 20 ? 'fair' : 'poor'; }

function startGps() {
  if (!G.geolocationSupported()) { setStatus('This device does not support GPS in the browser.'); return; }
  if (M.watchId !== null) return;
  setStatus('Waiting for GPS…');
  $('#btn-gps-start').textContent = 'Stop GPS';
  let firstFix = true;
  M.watchId = navigator.geolocation.watchPosition(
    (p) => {
      M.fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      if (M.collecting) M.collecting.push(M.fix);
      showCurrentLocation(M.fix, firstFix);
      firstFix = false;
      setStatus(`GPS accuracy ±${Math.round(M.fix.accuracy)} m`, accClass(M.fix.accuracy));
      $('#btn-mark').disabled = false;
    },
    (err) => { setStatus(G.explainGeoError(err)); stopGps(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

function stopGps() {
  if (M.watchId !== null) navigator.geolocation.clearWatch(M.watchId);
  M.watchId = null;
  M.fix = null;
  M.collecting = null;
  $('#btn-gps-start').textContent = 'Start GPS';
  $('#btn-mark').disabled = true;
}

function showCurrentLocation(position, center = false) {
  const latlng = { lat: position.lat, lng: position.lng };
  if (!M.you) {
    M.you = createMarker(M.map, { position: latlng, kind: 'you', title: 'Your current location' });
    M.circle = createCircle(M.map, { center: latlng, radius: position.accuracy || 0 });
  } else {
    M.you.setLatLng([latlng.lat, latlng.lng]);
    M.circle.setLatLng([latlng.lat, latlng.lng]);
    M.circle.setRadius(position.accuracy || 0);
  }
  if (center) mapSetView(M.map, latlng, Math.max(M.map.getZoom(), 18));
}

async function markCorner() {
  if (!M.fix || M.collecting) return;
  const btn = $('#btn-mark');
  btn.disabled = true;
  M.collecting = [M.fix];
  for (let s = AVERAGE_SECONDS; s > 0; s -= 1) {
    btn.textContent = `Averaging GPS… ${s}s`;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
    if (!M.collecting) return; // GPS stopped meanwhile
  }
  const fixes = M.collecting;
  M.collecting = null;
  btn.textContent = 'Mark corner here';
  btn.disabled = M.watchId === null;
  const avg = G.averageFixes(fixes);
  if (avg.accuracy > MAX_POINT_ACCURACY_M) {
    toast(`GPS accuracy is only ±${Math.round(avg.accuracy)} m here. Move to open sky and try again.`, 'error', 6000);
    return;
  }
  M.pts.push({ lat: avg.lat, lng: avg.lng, acc: avg.accuracy });
  redraw();
}

function addTapPoint(latlng) {
  M.pts.push({ lat: latlng.lat, lng: latlng.lng, acc: null });
  redraw();
}

function redraw() {
  M.markers.forEach(removeOverlay);
  M.markers = M.pts.map((p, i) => {
    const m = createMarker(M.map, {
      position: p,
      kind: i === 0 ? 'first' : 'vertex',
      draggable: true,
      title: `Corner ${i + 1} (drag to adjust)`,
    });
    m.on('dragend', () => {
      const ll = markerPosition(m);
      M.pts[i] = { lat: ll.lat, lng: ll.lng, acc: null };
      redraw();
    });
    return m;
  });
  removeOverlay(M.poly);
  M.poly = null;
  if (M.pts.length >= 3) M.poly = createPolygon(M.map, M.pts);
  else if (M.pts.length === 2) M.poly = createPolyline(M.map, M.pts);
  renderReadout();
}

function renderReadout() {
  const out = $('#measure-out');
  const warn = $('#measure-warn');
  const acc = $('#measure-acc');
  const useBtn = $('#btn-use-area');
  warn.classList.add('hidden');
  const n = M.pts.length;
  if (n < 3) {
    setHTML(out, html`<p class="muted" style="grid-column:1/-1;margin:0">${n} corner${n === 1 ? '' : 's'} marked. Add at least 3 to see the area.</p>`);
    acc.textContent = '';
    useBtn.disabled = true;
    return;
  }
  const sqm = G.polygonAreaSqm(M.pts);
  const a = G.areaBreakdown(sqm);
  const per = G.perimeterM(M.pts);
  setHTML(out, html`
    <div style="grid-column:1/-1"><div class="v" style="font-size:2rem">${a.wholeAcres} acre${a.wholeAcres === 1 ? '' : 's'} ${num(a.restGuntas, 1)} guntas</div><div class="k">Total land area</div></div>
    <div><div class="v">${num(a.guntasTotal, 1)}</div><div class="k">guntas</div></div>
    <div><div class="v">${num(a.acres, 3)}</div><div class="k">acres</div></div>
    <div><div class="v">${num(a.hectares, 3)}</div><div class="k">hectares</div></div>
    <div><div class="v">${num(a.sqm, 0)}</div><div class="k">sq metres</div></div>
    <div><div class="v">${num(a.sqft, 0)}</div><div class="k">sq feet</div></div>
    <div><div class="v">${num(per, 0)} m</div><div class="k">boundary length</div></div>`);

  const known = M.pts.filter((p) => p.acc);
  const sigma = known.length ? Math.max(1, known.reduce((s, p) => s + p.acc, 0) / known.length) : DRAW_SIGMA_M;
  const std = G.areaStdSqm(M.pts, sigma);
  const stdGuntas = std / G.SQM_PER_GUNTA;
  acc.textContent = `Estimated accuracy: about ±${num(stdGuntas, stdGuntas < 10 ? 1 : 0)} guntas (±${num((std / sqm) * 100, 1)}%), assuming each corner is within ±${num(sigma, 1)} m. Larger fields and more careful corners are proportionally more accurate.`;

  if (G.selfIntersects(M.pts)) {
    warn.textContent = 'The boundary crosses itself, so the area may be wrong. Mark the corners in order around the field, without crossing lines.';
    warn.classList.remove('hidden');
  }
  useBtn.disabled = false;
}

function setMode(mode) {
  M.mode = mode;
  $$('[data-mm]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mm === mode)));
  $('#mm-help').textContent = HELP[mode];
  $('#gps-bar').classList.toggle('hidden', mode !== 'walk');
  if (mode === 'draw') stopGps();
}

async function initMap() {
  const saved = G.loadLocation();
  M.map = await createMap($('#map'), {
    center: saved ? [saved.lat, saved.lng] : CALCULATOR_FALLBACK_CENTER,
    zoom: saved ? 17 : 15,
    satellite: true,
  });
  M.map.on('click', (e) => { if (M.mode === 'draw') addTapPoint(mapClickPosition(e)); });
  $('#btn-center').addEventListener('click', async () => {
    try {
      const p = await G.getPosition();
      showCurrentLocation(p);
      mapSetView(M.map, p, 18);
      setStatus(`GPS accuracy ±${Math.round(p.accuracy)} m`, accClass(p.accuracy));
    } catch (err) { toast(G.explainGeoError(err), 'error', 6000); }
  });
  try {
    const position = await G.getPosition({ timeout: 15000 });
    showCurrentLocation(position);
    mapSetView(M.map, position, 17);
    setStatus(`Current location shown. GPS accuracy ±${Math.round(position.accuracy)} m`, accClass(position.accuracy));
  } catch (err) {
    setStatus(saved
      ? `Showing your last saved location. ${G.explainGeoError(err)}`
      : `Showing the selected map location. ${G.explainGeoError(err)}`);
  }
}

$$('[data-mm]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mm)));
$('#btn-gps-start').addEventListener('click', () => (M.watchId === null ? startGps() : stopGps()));
$('#btn-mark').addEventListener('click', markCorner);
$('#btn-undo').addEventListener('click', () => { M.pts.pop(); redraw(); });
$('#btn-clear').addEventListener('click', () => { M.pts = []; M.measured = null; redraw(); });
window.addEventListener('pagehide', stopGps);

/* ================================================================== */
/*  Step 2: yield calculator                                          */
/* ================================================================== */

const C = { crops: [], mode: 'estimate', kgPerAcre: 0 };
const el = {
  crop: $('#c-crop'), area: $('#c-area'), unit: $('#c-unit'), yield: $('#c-yield'), yunit: $('#c-yunit'), per: $('#c-per'),
  bag: $('#c-bag'), bagCustom: $('#c-bag-custom'), price: $('#c-price'), bags: $('#c-bags'),
};

const bagKg = () => {
  const v = el.bag.value === 'custom' ? Number(el.bagCustom.value) : Number(el.bag.value);
  return v > 0 ? v : 0;
};
const areaAcres = () => {
  const v = Number(el.area.value);
  return v > 0 ? (v * G.AREA_UNITS[el.unit.value].sqm) / G.SQM_PER_ACRE : 0;
};
const currentCrop = () => C.crops.find((c) => String(c.id) === el.crop.value) || null;
const yieldFactor = () => ({ kg: 1, quintal: 100, bag: bagKg() || 1 }[el.yunit.value]);
const perFactor = () => (el.per.value === 'gunta' ? 40 : 1);

const trim = (n) => String(Number(n.toFixed(n < 10 ? 2 : 1)));

/** Show the stored kg-per-acre yield in the unit the farmer picked (kg / quintal / bags, per acre / per gunta). */
function showYield() {
  el.yield.value = C.kgPerAcre ? trim(C.kgPerAcre / perFactor() / yieldFactor()) : '';
}

function readYield() {
  const v = Number(el.yield.value);
  C.kgPerAcre = v > 0 ? v * yieldFactor() * perFactor() : 0;
}

function applyCrop() {
  const crop = currentCrop();
  if (crop) {
    C.kgPerAcre = crop.yieldPerAcreKg;
    showYield();
    if (crop.defaultPricePerQuintal) el.price.value = crop.defaultPricePerQuintal;
  }
  calculate();
}

function areaNote() {
  const a = areaAcres();
  $('#c-area-note').textContent = a > 0 ? `= ${num(a, 3)} acres = ${num(a * 40, 1)} guntas = ${num(a * G.SQM_PER_ACRE / G.SQM_PER_HECTARE, 3)} hectares` : '';
}

function row(k, v) { return html`<div><div class="v">${v}</div><div class="k">${k}</div></div>`; }

let lastCalc = null;

function calculate() {
  areaNote();
  const acres = areaAcres();
  const bag = bagKg();
  const price = Number(el.price.value) || 0;
  const crop = currentCrop();
  const host = $('#result');
  lastCalc = null;

  if (!(acres > 0)) { setHTML(host, html`<div class="empty"><p>Enter your land size (or measure it above) to see the result.</p></div>`); toggleSave(false); return; }
  if (!(bag > 0)) { setHTML(host, html`<div class="empty"><p>Choose the weight of one bag.</p></div>`); toggleSave(false); return; }

  let totalKg; let kgPerAcre;
  if (C.mode === 'estimate') {
    if (!(C.kgPerAcre > 0)) { setHTML(host, html`<div class="empty"><p>Enter the expected yield.</p></div>`); toggleSave(false); return; }
    kgPerAcre = C.kgPerAcre;
    totalKg = acres * kgPerAcre;
  } else {
    const bagsHarvested = Number(el.bags.value);
    if (!(bagsHarvested > 0)) { setHTML(host, html`<div class="empty"><p>Enter how many bags you harvested.</p></div>`); toggleSave(false); return; }
    totalKg = bagsHarvested * bag;
    kgPerAcre = totalKg / acres;
  }

  const bags = totalKg / bag;
  const whole = Math.floor(bags + 1e-9);
  const loose = totalKg - whole * bag;
  const revenue = price > 0 ? (totalKg / 100) * price : null;
  const vs = crop && C.mode === 'actual' ? (kgPerAcre / crop.yieldPerAcreKg - 1) * 100 : null;

  setHTML(host, html`<div class="result-hero">
    <div class="sub">${C.mode === 'estimate' ? 'Expected harvest' : 'Your actual harvest'}</div>
    <div class="big">${num(whole)} bags</div>
    <div class="sub">of ${num(bag, 1)} kg each${loose > 0.5 ? ` + ${num(loose, 1)} kg loose` : ''}</div>
    <hr>
    <div class="result-grid">
      ${row('Total weight', `${num(totalKg, 0)} kg`)}
      ${row('Quintals', num(totalKg / 100, 2))}
      ${row('Tonnes', num(totalKg / 1000, 3))}
      ${row('Land', `${num(acres, 2)} acres / ${num(acres * 40, 1)} guntas`)}
      ${row('Yield per acre', `${num(kgPerAcre / bag, 1)} bags (${num(kgPerAcre, 0)} kg)`)}
      ${row('Yield per gunta', `${num(kgPerAcre / 40 / bag, 2)} bags (${num(kgPerAcre / 40, 1)} kg)`)}
      ${revenue !== null ? row('Estimated income', money(Math.round(revenue))) : ''}
      ${vs !== null ? row(`Compared with ${crop.name} average`, `${vs >= 0 ? '+' : ''}${num(vs, 0)}%`) : ''}
    </div></div>`);

  lastCalc = { acres, kgPerAcre, bag, price, crop };
  toggleSave(true);
}

function toggleSave(ok) {
  const farmer = user?.role === 'farmer';
  $('#save-box').classList.toggle('hidden', !(ok && farmer));
  $('#save-hint').classList.toggle('hidden', !(ok && !user));
}

function setCalcMode(mode) {
  C.mode = mode;
  $$('[data-cm]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cm === mode)));
  $('#est-yield').classList.toggle('hidden', mode !== 'estimate');
  $('#act-bags').classList.toggle('hidden', mode !== 'actual');
  $('#price-wrap').querySelector('label').firstChild.textContent = mode === 'estimate' ? 'Selling price (INR per quintal) ' : 'Price you got (INR per quintal) ';
  calculate();
}

function initCalculator(crops) {
  C.crops = crops;
  el.crop.innerHTML = '<option value="">Other crop (enter yield myself)</option>' +
    crops.map((c) => `<option value="${c.id}">${c.name.replace(/[<>&"]/g, '')}</option>`).join('');
  const first = crops.find((c) => /paddy/i.test(c.name)) || crops[0];
  if (first) el.crop.value = String(first.id);

  el.crop.addEventListener('change', applyCrop);
  [el.area, el.price, el.bags].forEach((i) => i.addEventListener('input', () => {
    if (i === el.area) M.measured = M.measured && Math.abs(areaAcres() - M.measured.acres) < 0.0005 ? M.measured : null;
    calculate();
  }));
  // Switching the land unit converts the number so the area stays the same.
  let prevUnit = el.unit.value;
  el.unit.addEventListener('change', () => {
    const v = Number(el.area.value);
    if (v > 0) {
      const sqm = v * G.AREA_UNITS[prevUnit].sqm;
      el.area.value = String(Number((sqm / G.AREA_UNITS[el.unit.value].sqm).toFixed(4)));
    }
    prevUnit = el.unit.value;
    calculate();
  });
  el.yield.addEventListener('input', () => { readYield(); calculate(); });
  // Changing how the yield is expressed must not change the yield itself.
  [el.yunit, el.per].forEach((s) => s.addEventListener('change', () => { showYield(); calculate(); }));
  el.bag.addEventListener('change', () => {
    el.bagCustom.classList.toggle('hidden', el.bag.value !== 'custom');
    if (el.bag.value === 'custom') el.bagCustom.focus();
    showYield();
    calculate();
  });
  el.bagCustom.addEventListener('input', () => { showYield(); calculate(); });
  $$('[data-cm]').forEach((b) => b.addEventListener('click', () => setCalcMode(b.dataset.cm)));
  $('#calc-form').addEventListener('submit', (e) => e.preventDefault());
  applyCrop();
}

$('#btn-use-area').addEventListener('click', () => {
  if (M.pts.length < 3) return;
  const acres = G.polygonAreaSqm(M.pts) / G.SQM_PER_ACRE;
  el.unit.value = 'acre';
  el.unit.dispatchEvent(new Event('change')); // keeps the unit-conversion bookkeeping in sync
  el.area.value = String(Number(acres.toFixed(3)));
  M.measured = { acres: Number(acres.toFixed(3)), pts: M.pts.map(({ lat, lng }) => ({ lat, lng })) };
  calculate();
  toast(`Using ${num(acres, 3)} acres (${num(acres * 40, 1)} guntas) from your measurement`, 'success');
  $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#save-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  showFormError(f, '');
  const label = $('#save-label').value.trim();
  if (!label) { toast('Give this calculation a name', 'error'); $('#save-label').focus(); return; }
  if (!lastCalc) return;
  const crop = lastCalc.crop?.name || 'Other crop';
  const body = {
    label, crop, area: Number(el.area.value), unit: el.unit.value,
    yieldPerAcreKg: Number(lastCalc.kgPerAcre.toFixed(2)), bagWeightKg: lastCalc.bag,
    pricePerQuintal: lastCalc.price > 0 ? lastCalc.price : undefined,
    polygon: M.measured && M.measured.pts.length >= 3 ? M.measured.pts : undefined,
  };
  try {
    await withBusy(f.querySelector('button[type=submit]'), () => api.post('/calculator/saved', body));
    toast('Saved. Find it under My farm → Saved calculations.', 'success', 5000);
    $('#save-label').value = '';
  } catch (err) { toast(err.message, 'error', 6000); }
});

/* ------------------------------------------------------------------ Boot */
setMode('walk');
renderReadout();
try {
  await initMap();
} catch (err) {
  console.error(err);
  $('#map').classList.add('map-error');
  $('#map').textContent = err.message;
  $('#measure-warn').textContent = err.message;
  $('#measure-warn').classList.remove('hidden');
  setStatus('Map unavailable. You can still use the crop-yield calculator.');
  ['#btn-gps-start', '#btn-mark', '#btn-undo', '#btn-clear', '#btn-center', '#btn-use-area']
    .forEach((selector) => { $(selector).disabled = true; });
  $$('[data-mm]').forEach((button) => { button.disabled = true; });
}
try {
  initCalculator((await api.get('/calculator/crops')).items);
} catch (err) {
  initCalculator([]);
  toast('Could not load the crop list. You can still enter a yield yourself.', 'error', 6000);
}
