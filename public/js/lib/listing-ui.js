// Shared UI for machinery and labour listings: cards, detail dialog and the booking request form.
import { api } from './api.js';
import { getMeta } from './session.js';
import { loadLocation } from './geo.js';
import {
  html, raw, esc, money, num, label, stars, openModal, toast, withBusy, showFormError, todayISO, fmtDate,
} from './dom.js';

/* --------------------------------------------------------------- Helpers */

export const categoryLabel = (meta, id) => meta?.categories?.find((c) => c.id === id)?.label || label(id);
export const skillLabel = (meta, id) => meta?.labourSkills?.find((c) => c.id === id)?.label || label(id);

function distanceHTML(km) {
  if (km === null || km === undefined) return html`<div class="dist unknown">Set location<br>for distance</div>`;
  return html`<div class="dist" title="Distance from your chosen location">${km < 10 ? km.toFixed(1) : Math.round(km)}<small>km</small></div>`;
}

function priceHTML(t) {
  const parts = [];
  if (t.pricePerDay) parts.push(html`<span class="price">${money(t.pricePerDay)} <small>/ day</small></span>`);
  if (t.pricePerHour) parts.push(html`<span class="price">${money(t.pricePerHour)} <small>/ hour</small></span>`);
  if (t.pricePerAcre) parts.push(html`<span class="price">${money(t.pricePerAcre)} <small>/ acre</small></span>`);
  return parts.length ? parts.map((p, i) => html`${i ? raw(' &middot; ') : ''}${p}`) : '';
}

const place = (x) => [x.village, x.district].filter(Boolean).join(', ');

function mapsLink(item) {
  if (item.lat == null || item.lng == null) return '';
  const destination = encodeURIComponent(`${item.lat},${item.lng}`);
  return html`<a class="btn small ghost open-map" href="https://www.google.com/maps/dir/?api=1&destination=${destination}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`;
}

/* ----------------------------------------------------------------- Cards */

export function toolCard(t, meta) {
  const img = t.images?.[0];
  return html`<article class="plot listing" data-kind="tool" data-id="${t.id}">
    <button type="button" class="listing-content" aria-label="${t.name}, view details">
      <div class="photo ${img ? '' : 'none'}">${img ? raw(`<img src="${esc(img.url)}" alt="" loading="lazy" width="400" height="300">`) : 'No photo'}</div>
      <div class="body">
        <div class="top"><div><h3>${t.name}</h3><div class="meta">${categoryLabel(meta, t.category)}${t.brand ? ` · ${t.brand}` : ''}</div></div>${distanceHTML(t.distanceKm)}</div>
        <div>${priceHTML(t)}</div>
        <div class="meta">${place(t) || 'Location on map'} · ${t.ownerName}</div>
        <div class="tags">${t.withOperator ? html`<span class="tag">With operator</span>` : ''}${stars(t.rating)}</div>
      </div>
    </button>
    <div class="listing-actions">${mapsLink(t)}</div>
  </article>`;
}

export function labourCard(l, meta) {
  return html`<article class="plot listing" data-kind="labour" data-id="${l.id}">
    <button type="button" class="listing-content" aria-label="${l.title}, view details">
      <div class="body">
        <div class="top"><div><h3>${l.title}</h3><div class="meta">${skillLabel(meta, l.skill)}</div></div>${distanceHTML(l.distanceKm)}</div>
        <div><span class="price">${money(l.wagePerDay)} <small>/ person / day</small></span></div>
        <div class="meta">Team of ${num(l.teamSize)} · ${place(l) || 'Location on map'}</div>
        <div class="meta">${l.providerName}</div>
        <div class="tags">${stars(l.rating)}</div>
      </div>
    </button>
    <div class="listing-actions">${mapsLink(l)}</div>
  </article>`;
}

/* ---------------------------------------------------------------- Detail */

function galleryHTML(images) {
  if (!images?.length) return html`<div class="gallery"><div class="main muted" style="display:grid;place-items:center">No photos</div></div>`;
  return html`<div class="gallery">
    <div class="main"><img id="g-main" src="${images[0].url}" alt="Machine photo 1 of ${images.length}"></div>
    ${images.length > 1 ? html`<div class="thumbs">${images.map((im, i) =>
      html`<button type="button" data-img="${im.url}" data-n="${i + 1}" ${i === 0 ? raw('aria-current="true"') : ''} aria-label="Show photo ${i + 1}"><img src="${im.url}" alt="" loading="lazy"></button>`)}</div>` : ''}
  </div>`;
}

function bindGallery(root) {
  root.querySelectorAll('.thumbs button').forEach((b) => b.addEventListener('click', () => {
    const main = root.querySelector('#g-main');
    main.src = b.dataset.img;
    main.alt = `Machine photo ${b.dataset.n}`;
    root.querySelectorAll('.thumbs button').forEach((x) => x.removeAttribute('aria-current'));
    b.setAttribute('aria-current', 'true');
  }));
}

function bookingFormHTML(kind, item, user) {
  if (!user) {
    return html`<div class="form-note">Log in as a farmer to send a booking request.
      <a class="btn small" href="/login?role=farmer&next=${encodeURIComponent(location.pathname)}">Farmer login</a></div>`;
  }
  if (user.role !== 'farmer') {
    return html`<p class="muted">Only farmer accounts can send booking requests.</p>`;
  }
  const today = todayISO();
  return html`<form id="book-form" class="stack" novalidate>
    <h3>Request this ${kind === 'tool' ? 'machine' : 'team'}</h3>
    <div class="form-grid">
      <div class="field"><label for="b-start">From</label><input id="b-start" name="startDate" type="date" min="${today}" value="${today}" required></div>
      <div class="field"><label for="b-end">To</label><input id="b-end" name="endDate" type="date" min="${today}" value="${today}" required></div>
      ${kind === 'tool' ? html`<div class="field"><label for="b-acres">Land to work (acres)</label>
        <input id="b-acres" name="landAcres" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="e.g. 2.5">
        <p class="hint">${item.pricePerAcre ? 'Used to calculate the per-acre price.' : 'Optional'} Measure it with the <a href="/calculator">GPS land tool</a>.</p></div>` : ''}
      <div class="field full"><label for="b-addr">Where is the work?</label><input id="b-addr" name="workAddress" type="text" maxlength="300" placeholder="Village / survey number / landmark"></div>
      <div class="field full"><label for="b-notes">Note to the ${kind === 'tool' ? 'owner' : 'provider'}</label><textarea id="b-notes" name="notes" maxlength="1000" placeholder="Crop, soil condition, timing, anything useful"></textarea></div>
    </div>
    <p class="muted" id="b-quote" aria-live="polite"></p>
    <button class="btn" type="submit" data-busy-text="Sending">Send request</button>
    <p class="hint muted">The ${kind === 'tool' ? 'owner' : 'provider'}'s phone number is shared with you once they accept.</p>
  </form>`;
}

function quoteText(kind, item, form) {
  const s = form.startDate.value;
  const e = form.endDate.value;
  if (!s || !e || e < s) return '';
  const days = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86400000) + 1;
  let amt = null;
  if (kind === 'labour') amt = item.wagePerDay * item.teamSize * days;
  else {
    const acres = Number(form.landAcres?.value);
    if (item.pricePerAcre && acres > 0) amt = item.pricePerAcre * acres;
    else if (item.pricePerDay) amt = item.pricePerDay * days;
    else if (item.pricePerHour) amt = item.pricePerHour * 8 * days;
  }
  return amt === null ? '' : `${days} day${days > 1 ? 's' : ''} · estimated ${money(Math.round(amt))} (final amount is agreed with the ${kind === 'tool' ? 'owner' : 'provider'}).`;
}

function wireBooking(root, kind, item, user, close) {
  const form = root.querySelector('#book-form');
  if (!form) return;
  const refresh = () => { root.querySelector('#b-quote').textContent = quoteText(kind, item, form); };
  form.addEventListener('input', () => {
    if (form.endDate.value < form.startDate.value) form.endDate.value = form.startDate.value;
    form.endDate.min = form.startDate.value;
    refresh();
  });
  refresh();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(form, '');
    const loc = loadLocation();
    const body = {
      kind,
      [kind === 'tool' ? 'toolId' : 'labourId']: item.id,
      startDate: form.startDate.value,
      endDate: form.endDate.value,
      landAcres: form.landAcres?.value || undefined,
      workAddress: form.workAddress.value.trim() || undefined,
      notes: form.notes.value.trim() || undefined,
      workLat: loc?.lat,
      workLng: loc?.lng,
    };
    try {
      await withBusy(form.querySelector('button[type=submit]'), () => api.post('/bookings', body));
      toast('Request sent. You will see the answer in My farm.', 'success', 6000);
      close();
    } catch (err) {
      showFormError(form, err.details?.length ? `${err.message}: ${JSON.stringify(err.details)}`.slice(0, 200) : err.message);
    }
  });
}

export async function openToolDetail(id, user) {
  const meta = await getMeta().catch(() => null);
  let data;
  try { data = await api.get(`/tools/${id}`); } catch (err) { toast(err.message, 'error'); return; }
  const { tool: t, reviews } = data;
  const m = openModal({
    title: t.name,
    wide: true,
    body: html`<div class="detail-grid">
      <div>${galleryHTML(t.images)}</div>
      <div>
        <div class="row between"><span class="badge neutral">${categoryLabel(meta, t.category)}</span>${stars(t.rating)}</div>
        <p style="margin-top:.6rem">${priceHTML(t)}</p>
        <dl class="specs">
          ${t.brand ? html`<dt>Brand</dt><dd>${t.brand}</dd>` : ''}
          ${t.model ? html`<dt>Model</dt><dd>${t.model}</dd>` : ''}
          ${t.year ? html`<dt>Year</dt><dd>${t.year}</dd>` : ''}
          <dt>Operator</dt><dd>${t.withOperator ? 'Included' : 'Self-drive / not included'}</dd>
          <dt>Location</dt><dd>${place(t) || '—'}${t.distanceKm != null ? ` · ${t.distanceKm} km away` : ''}</dd>
          <dt>Serves within</dt><dd>${t.serviceRadiusKm} km</dd>
          <dt>Owner</dt><dd>${t.ownerName}</dd>
        </dl>
        ${mapsLink(t)}
        ${t.description ? html`<p>${t.description}</p>` : ''}
        ${t.status !== 'approved' ? html`<p class="form-note">This listing is <strong>${t.status}</strong> and is not visible to farmers yet.</p>` : ''}
        ${t.status === 'approved' ? bookingFormHTML('tool', t, user) : ''}
      </div>
    </div>
    ${reviews.length ? html`<h3 style="margin-top:1.25rem">Reviews</h3>${reviews.map((r) => html`<div class="review"><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span> <strong>${r.farmer}</strong> <span class="muted small">${fmtDate(r.date)}</span>${r.review ? html`<p style="margin:.2rem 0 0">${r.review}</p>` : ''}</div>`)}` : ''}`,
  });
  bindGallery(m.body);
  wireBooking(m.body, 'tool', t, user, m.close);
}

export async function openLabourDetail(id, user) {
  const meta = await getMeta().catch(() => null);
  let data;
  try { data = await api.get(`/labour/${id}`); } catch (err) { toast(err.message, 'error'); return; }
  const l = data.labour;
  const m = openModal({
    title: l.title,
    body: html`<div class="stack">
      <div class="row between"><span class="badge neutral">${skillLabel(meta, l.skill)}</span>${stars(l.rating)}</div>
      <dl class="specs">
        <dt>Wage</dt><dd>${money(l.wagePerDay)} per person per day</dd>
        <dt>Team size</dt><dd>${num(l.teamSize)} people</dd>
        <dt>Location</dt><dd>${place(l) || '—'}${l.distanceKm != null ? ` · ${l.distanceKm} km away` : ''}</dd>
        <dt>Serves within</dt><dd>${l.serviceRadiusKm} km</dd>
        <dt>Provider</dt><dd>${l.providerName}</dd>
      </dl>
      ${mapsLink(l)}
      ${l.description ? html`<p>${l.description}</p>` : ''}
      ${l.status === 'approved' ? bookingFormHTML('labour', l, user) : html`<p class="form-note">This listing is <strong>${l.status}</strong>.</p>`}
    </div>`,
  });
  wireBooking(m.body, 'labour', l, user, m.close);
}

export function openDetail(kind, id, user) {
  return kind === 'labour' ? openLabourDetail(id, user) : openToolDetail(id, user);
}
