// Owner / provider dashboard: booking requests, machines (with photo upload), labour teams, customer history.
import { api } from './lib/api.js';
import { requireRole, getMeta, resetUser } from './lib/session.js';
import {
  $, html, raw, setHTML, on, money, num, fmtDate, label, toast, withBusy, showFormError, confirmDialog, openModal, esc,
} from './lib/dom.js';
import { mountBookingList } from './lib/bookings-ui.js';
import { mountTabs } from './lib/tabs.js';
import { locationPicker } from './lib/map.js';
import { categoryLabel, skillLabel, openToolDetail } from './lib/listing-ui.js';

const user = await requireRole('owner', 'owner');
const meta = await getMeta();
$('#greet').textContent = user.businessName || user.name || 'My business';

const loaded = new Set();
let tools = [];
let labour = [];

const statusNote = (x) => (x.status === 'rejected'
  ? html`<p class="form-error" style="margin:.5rem 0 0">Rejected by admin: ${x.adminNote || 'no reason given'}. Edit the listing and save to send it for review again.</p>`
  : x.status === 'pending' ? html`<p class="muted small" style="margin:.4rem 0 0">Waiting for admin approval. Farmers cannot see it yet.</p>` : '');

/* ----------------------------------------------------------------- Stats */
async function loadStats() {
  try {
    const s = await api.get('/bookings/summary');
    setHTML($('#stats'), html`
      <div class="stat ${s.totals.pending ? 'alert' : ''}"><div class="n">${num(s.totals.pending)}</div><div class="l">New requests</div></div>
      <div class="stat"><div class="n">${num(s.totals.completed)}</div><div class="l">Jobs completed</div></div>
      <div class="stat"><div class="n">${num(s.customers.length)}</div><div class="l">Customers served</div></div>
      <div class="stat"><div class="n">${money(s.totals.earned)}</div><div class="l">Earned</div></div>`);
    tabsApi?.setCount('requests', s.totals.pending || '');
    return s;
  } catch (err) { toast(err.message, 'error'); return null; }
}

/* ------------------------------------------------------------- Customers */
async function renderCustomers() {
  const host = $('#panel-customers');
  setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
  try {
    const s = await api.get('/bookings/summary');
    if (!s.customers.length) {
      setHTML(host, html`<div class="empty"><h3>No customers yet</h3><p>Farmers whose requests you accept appear here with the services you provided.</p></div>`);
      return;
    }
    setHTML(host, html`<p class="muted">Farmers you have served, and which of your services they used.</p>
      <div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>Services provided</th><th class="num">Jobs</th><th class="num">Completed</th><th class="num">Earned</th><th>Last service</th></tr></thead>
      <tbody>${s.customers.map((c) => html`<tr><td><strong>${c.name || 'Farmer'}</strong><br><span class="muted small">${[c.village, c.district].filter(Boolean).join(', ')}</span>
        ${c.phone ? html`<br><a href="tel:${c.phone}">${c.phone}</a>` : ''}</td>
        <td>${c.services.join(', ')}</td><td class="num">${c.bookings}</td><td class="num">${c.completed}</td><td class="num">${money(c.earned)}</td><td class="nowrap">${fmtDate(c.lastService)}</td></tr>`)}</tbody>
      </table></div>`);
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); }
}

/* -------------------------------------------------------------- Machines */
async function renderMachines() {
  const host = $('#panel-machines');
  setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
  try {
    tools = (await api.get('/tools/mine/list')).items;
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); return; }
  if (!tools.length) {
    setHTML(host, html`<div class="empty"><h3>No machines listed</h3><p>Add a tractor, harvester or drone with photos and a price. Farmers near you will find it.</p><button class="btn" data-add-tool>Add your first machine</button></div>`);
    return;
  }
  setHTML(host, html`<div class="listing-grid">${tools.map((t) => html`<article class="plot listing" style="cursor:default" aria-label="${t.name}">
    <div class="photo ${t.images[0] ? '' : 'none'}">${t.images[0] ? raw(`<img src="${esc(t.images[0].url)}" alt="" loading="lazy">`) : 'No photo'}</div>
    <div class="body">
      <div class="top"><h3>${t.name}</h3><span class="badge ${t.status}">${label(t.status)}</span></div>
      <div class="meta">${categoryLabel(meta, t.category)} · ${t.images.length} photo${t.images.length === 1 ? '' : 's'}</div>
      <div class="price">${[t.pricePerDay && `${money(t.pricePerDay)}/day`, t.pricePerHour && `${money(t.pricePerHour)}/hr`, t.pricePerAcre && `${money(t.pricePerAcre)}/acre`].filter(Boolean).join(' · ')}</div>
      ${statusNote(t)}
      <label class="check"><input type="checkbox" data-avail="tool" data-id="${t.id}" ${t.available ? raw('checked') : ''}> Available for booking</label>
      <div class="row"><button class="btn small ghost" data-view-tool="${t.id}">Preview</button><button class="btn small dark" data-edit-tool="${t.id}">Edit</button><button class="btn small ghost" data-del-tool="${t.id}">Delete</button></div>
    </div></article>`)}</div>`);
}

on($('#panel-machines'), 'click', '[data-add-tool]', () => openToolForm());
on($('#panel-machines'), 'click', '[data-edit-tool]', (e, el) => openToolForm(tools.find((t) => t.id === Number(el.dataset.editTool))));
on($('#panel-machines'), 'click', '[data-view-tool]', (e, el) => openToolDetail(Number(el.dataset.viewTool), user));
on($('#panel-machines'), 'click', '[data-del-tool]', async (e, el) => {
  if (!(await confirmDialog('Delete this machine and its photos? This cannot be undone.', { confirmText: 'Delete', danger: true }))) return;
  try { await api.del(`/tools/${el.dataset.delTool}`); toast('Machine deleted', 'success'); renderMachines(); } catch (err) { toast(err.message, 'error', 6000); }
});
on($('#panel-machines'), 'change', '[data-avail]', async (e, el) => {
  try { await api.patch(`/tools/${el.dataset.id}/availability`, { available: el.checked }); toast(el.checked ? 'Marked available' : 'Marked unavailable', 'success'); } catch (err) { el.checked = !el.checked; toast(err.message, 'error'); }
});

const opts = (list, sel) => list.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
const val = (v) => (v === null || v === undefined ? '' : v);

function locationFields(x) {
  return html`<div class="field"><label for="f-village">Village / town</label><input id="f-village" name="village" maxlength="80" value="${val(x?.village ?? user.village)}"></div>
    <div class="field"><label for="f-district">District</label><input id="f-district" name="district" maxlength="80" value="${val(x?.district ?? user.district)}"></div>
    <div class="field"><label for="f-state">State</label><input id="f-state" name="state" maxlength="80" value="${val(x?.state ?? user.state)}"></div>
    <div class="field"><label for="f-radius">Service radius (km)</label><input id="f-radius" name="serviceRadiusKm" type="number" min="1" max="500" value="${val(x?.serviceRadiusKm ?? 25)}"></div>
    <div class="field full"><span class="label" style="font-weight:600">Where is it kept? <span class="muted small" id="f-coords"></span></span>
      <div id="f-map" class="map picker"></div>
      <div><button type="button" class="btn ghost small" id="f-gps" style="margin-top:.4rem">Use my GPS</button></div></div>`;
}

async function mountPicker(modal, x) {
  const start = x?.lat != null ? x : user;
  const mapEl = modal.querySelector('#f-map');
  try {
    const picker = await locationPicker(mapEl, {
      lat: start.lat ?? undefined, lng: start.lng ?? undefined, zoom: 6,
      onChange: (v) => { modal.querySelector('#f-coords').textContent = `(${v.lat.toFixed(5)}, ${v.lng.toFixed(5)})`; },
    });
    modal.querySelector('#f-gps').addEventListener('click', () => picker.useGps());
    setTimeout(() => picker.refresh(), 300);
    return picker;
  } catch (err) {
    mapEl.textContent = err.message;
    mapEl.classList.add('map-error');
    mapEl.setAttribute('role', 'alert');
    return null;
  }
}

function openToolForm(t) {
  const editing = !!t;
  const max = meta.limits.maxImages;
  const m = openModal({
    title: editing ? `Edit ${t.name}` : 'Add a machine',
    wide: true,
    body: html`<form id="tool-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="f-cat">Type</label><select id="f-cat" name="category" required>${raw(opts(meta.categories, t?.category))}</select></div>
        <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" maxlength="100" required value="${val(t?.name)}" placeholder="e.g. Mahindra 575 DI tractor"></div>
        <div class="field"><label for="f-brand">Brand</label><input id="f-brand" name="brand" maxlength="60" value="${val(t?.brand)}"></div>
        <div class="field"><label for="f-model">Model</label><input id="f-model" name="model" maxlength="60" value="${val(t?.model)}"></div>
        <div class="field"><label for="f-year">Year</label><input id="f-year" name="year" type="number" min="1970" max="${new Date().getFullYear() + 1}" value="${val(t?.year)}"></div>
        <label class="check"><input type="checkbox" name="withOperator" ${t?.withOperator ? raw('checked') : ''}> Operator / driver included</label>
        <div class="field full"><label for="f-desc">Description</label><textarea id="f-desc" name="description" maxlength="2000" placeholder="Horsepower, attachments, condition…">${val(t?.description)}</textarea></div>
        <div class="field"><label for="f-pday">Price per day (INR)</label><input id="f-pday" name="pricePerDay" type="number" min="0" step="1" value="${val(t?.pricePerDay)}"></div>
        <div class="field"><label for="f-phour">Price per hour (INR)</label><input id="f-phour" name="pricePerHour" type="number" min="0" step="1" value="${val(t?.pricePerHour)}"></div>
        <div class="field"><label for="f-pacre">Price per acre (INR)</label><input id="f-pacre" name="pricePerAcre" type="number" min="0" step="1" value="${val(t?.pricePerAcre)}"></div>
        <p class="hint muted full" style="margin:0 0 1rem">Add at least one price.</p>
        ${locationFields(t)}
        <div class="field full"><label for="f-img">Photos (${editing ? '' : 'at least 1, '}up to ${max}; JPEG, PNG or WebP, max ${meta.limits.maxImageMb} MB each)</label>
          <input id="f-img" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple>
          <div class="preview-grid" id="img-existing">${(t?.images || []).map((im) => html`<figure><img src="${im.url}" alt="Existing photo"><figcaption><label class="check" style="min-height:0;font-size:.8rem"><input type="checkbox" data-remove="${im.id}"> Remove</label></figcaption></figure>`)}</div>
          <div class="preview-grid" id="img-new"></div></div>
      </div></form>`,
    footer: html`<button class="btn ghost" type="button" data-close>Cancel</button><button class="btn dark" type="submit" form="tool-form" data-busy-text="Uploading">${editing ? 'Save changes' : 'Publish listing'}</button>`,
  });
  const form = m.dialog.querySelector('#tool-form');
  const fileInput = form.querySelector('#f-img');
  let picker;
  mountPicker(m.dialog, t).then((p) => { picker = p; });

  fileInput.addEventListener('change', () => {
    const box = form.querySelector('#img-new');
    box.replaceChildren();
    Array.from(fileInput.files).forEach((f) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.alt = f.name;
      img.src = URL.createObjectURL(f);
      img.onload = () => URL.revokeObjectURL(img.src);
      const cap = document.createElement('figcaption');
      cap.textContent = f.name.slice(0, 14);
      fig.append(img, cap);
      box.append(fig);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(form, '');
    const files = Array.from(fileInput.files);
    const removed = Array.from(form.querySelectorAll('[data-remove]:checked')).map((c) => c.dataset.remove);
    const remaining = (t?.images.length || 0) - removed.length + files.length;
    const pt = picker?.get();
    const get = (n) => form.elements[n].value.trim();
    if (get('name').length < 2) return showFormError(form, 'Please enter the machine name');
    if (!get('pricePerDay') && !get('pricePerHour') && !get('pricePerAcre')) return showFormError(form, 'Add at least one price (per day, hour or acre)');
    if (!pt) return showFormError(form, 'Set the machine location on the map');
    if (remaining < 1) return showFormError(form, 'Please add at least one photo');
    if (remaining > max) return showFormError(form, `A listing can have at most ${max} photos`);
    const bad = files.find((f) => !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > meta.limits.maxImageMb * 1024 * 1024);
    if (bad) return showFormError(form, `"${bad.name}" must be a JPEG, PNG or WebP image under ${meta.limits.maxImageMb} MB`);

    const fd = new FormData();
    ['category', 'name', 'brand', 'model', 'year', 'description', 'pricePerDay', 'pricePerHour', 'pricePerAcre', 'village', 'district', 'state', 'serviceRadiusKm']
      .forEach((n) => { if (get(n) !== '') fd.append(n, get(n)); });
    fd.append('withOperator', form.elements.withOperator.checked ? 'true' : 'false');
    fd.append('lat', pt.lat);
    fd.append('lng', pt.lng);
    if (removed.length) fd.append('removeImageIds', removed.join(','));
    files.forEach((f) => fd.append('images', f));
    try {
      await withBusy(m.footer.querySelector('[type=submit]'), () => (editing ? api.putForm(`/tools/${t.id}`, fd) : api.postForm('/tools', fd)));
      m.close();
      toast(editing ? 'Machine updated' : meta.listingsRequireApproval ? 'Machine submitted. It goes live after admin approval.' : 'Machine is now live', 'success', 6000);
      renderMachines();
    } catch (err) { showFormError(form, err.message); }
  });
}

/* ---------------------------------------------------------------- Labour */
async function renderLabour() {
  const host = $('#panel-labour');
  setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
  try { labour = (await api.get('/labour/mine/list')).items; } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); return; }
  if (!labour.length) {
    setHTML(host, html`<div class="empty"><h3>No labour teams listed</h3><p>Offer a work crew (sowing, harvesting, spraying…) with your daily wage.</p><button class="btn" data-add-labour>Add a labour team</button></div>`);
    return;
  }
  setHTML(host, html`<div class="listing-grid">${labour.map((l) => html`<article class="plot listing" style="cursor:default"><div class="body">
    <div class="top"><h3>${l.title}</h3><span class="badge ${l.status}">${label(l.status)}</span></div>
    <div class="meta">${skillLabel(meta, l.skill)} · team of ${num(l.teamSize)}</div>
    <div class="price">${money(l.wagePerDay)} <small class="muted">/ person / day</small></div>
    ${statusNote(l)}
    <label class="check"><input type="checkbox" data-avail="labour" data-id="${l.id}" ${l.available ? raw('checked') : ''}> Available</label>
    <div class="row"><button class="btn small dark" data-edit-labour="${l.id}">Edit</button><button class="btn small ghost" data-del-labour="${l.id}">Delete</button></div>
  </div></article>`)}</div>`);
}
on($('#panel-labour'), 'click', '[data-add-labour]', () => openLabourForm());
on($('#panel-labour'), 'click', '[data-edit-labour]', (e, el) => openLabourForm(labour.find((l) => l.id === Number(el.dataset.editLabour))));
on($('#panel-labour'), 'click', '[data-del-labour]', async (e, el) => {
  if (!(await confirmDialog('Delete this labour listing?', { confirmText: 'Delete', danger: true }))) return;
  try { await api.del(`/labour/${el.dataset.delLabour}`); renderLabour(); } catch (err) { toast(err.message, 'error', 6000); }
});
on($('#panel-labour'), 'change', '[data-avail]', async (e, el) => {
  try { await api.patch(`/labour/${el.dataset.id}/availability`, { available: el.checked }); } catch (err) { el.checked = !el.checked; toast(err.message, 'error'); }
});

function openLabourForm(l) {
  const editing = !!l;
  const m = openModal({
    title: editing ? 'Edit labour team' : 'Add a labour team',
    wide: true,
    body: html`<form id="lab-form" novalidate><div class="form-grid">
      <div class="field full"><label for="l-title">Title</label><input id="l-title" name="title" maxlength="100" required value="${val(l?.title)}" placeholder="e.g. Paddy transplanting crew"></div>
      <div class="field"><label for="l-skill">Type of work</label><select id="l-skill" name="skill">${raw(opts(meta.labourSkills, l?.skill))}</select></div>
      <div class="field"><label for="l-size">People in team</label><input id="l-size" name="teamSize" type="number" min="1" max="500" required value="${val(l?.teamSize ?? 5)}"></div>
      <div class="field"><label for="l-wage">Wage per person per day (INR)</label><input id="l-wage" name="wagePerDay" type="number" min="1" required value="${val(l?.wagePerDay)}"></div>
      <div class="field full"><label for="l-desc">Details</label><textarea id="l-desc" name="description" maxlength="1500" placeholder="Experience, tools they bring, working hours…">${val(l?.description)}</textarea></div>
      ${locationFields(l)}
    </div></form>`,
    footer: html`<button class="btn ghost" type="button" data-close>Cancel</button><button class="btn dark" type="submit" form="lab-form" data-busy-text="Saving">${editing ? 'Save changes' : 'Publish'}</button>`,
  });
  const form = m.dialog.querySelector('#lab-form');
  let picker;
  mountPicker(m.dialog, l).then((p) => { picker = p; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(form, '');
    const g = (n) => form.elements[n].value.trim();
    const pt = picker?.get();
    if (g('title').length < 2) return showFormError(form, 'Please enter a title');
    if (!(Number(g('wagePerDay')) > 0)) return showFormError(form, 'Enter the daily wage');
    if (!pt) return showFormError(form, 'Set the location on the map');
    const body = {
      title: g('title'), skill: g('skill'), teamSize: g('teamSize'), wagePerDay: g('wagePerDay'),
      description: g('description') || undefined, village: g('village') || undefined, district: g('district') || undefined,
      state: g('state') || undefined, serviceRadiusKm: g('serviceRadiusKm') || 25, lat: pt.lat, lng: pt.lng,
    };
    try {
      await withBusy(m.footer.querySelector('[type=submit]'), () => (editing ? api.put(`/labour/${l.id}`, body) : api.post('/labour', body)));
      m.close();
      toast(editing ? 'Labour team updated' : meta.listingsRequireApproval ? 'Submitted. It goes live after admin approval.' : 'Labour team is now live', 'success', 6000);
      renderLabour();
    } catch (err) { showFormError(form, err.message); }
  });
}

/* --------------------------------------------------------------- Profile */
function renderProfile() {
  const host = $('#panel-profile');
  setHTML(host, html`<form id="pf" class="plot" style="max-width:600px" novalidate>
    <h2 style="font-size:1.4rem">Business details</h2>
    <p class="muted">Mobile: <strong>${user.phone}</strong> (used to log in)${user.email ? html` · Email: <strong>${user.email}</strong>` : ''}</p>
    <div class="form-grid">
      <div class="field"><label for="n">Your name</label><input id="n" name="name" maxlength="80" required value="${val(user.name)}"></div>
      <div class="field"><label for="b">Business name</label><input id="b" name="businessName" maxlength="120" value="${val(user.businessName)}"></div>
      <div class="field"><label for="v">Village / town</label><input id="v" name="village" maxlength="80" value="${val(user.village)}"></div>
      <div class="field"><label for="d">District</label><input id="d" name="district" maxlength="80" value="${val(user.district)}"></div>
      <div class="field"><label for="s">State</label><input id="s" name="state" maxlength="80" value="${val(user.state)}"></div>
      <div class="field full"><span class="label" style="font-weight:600">Base location <span class="muted small" id="f-coords"></span></span><div id="f-map" class="map picker"></div>
        <div><button type="button" class="btn ghost small" id="f-gps" style="margin-top:.4rem">Use my GPS</button></div></div>
    </div>
    <button class="btn" type="submit" data-busy-text="Saving">Save changes</button></form>`);
  let picker;
  mountPicker(host, user).then((p) => { picker = p; });
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    showFormError(f, '');
    const pt = picker?.get();
    try {
      const r = await withBusy(f.querySelector('button[type=submit]'), () => api.put('/auth/me', {
        name: f.name.value.trim(), businessName: f.businessName.value.trim() || undefined, village: f.village.value.trim() || undefined,
        district: f.district.value.trim() || undefined, state: f.state.value.trim() || undefined, lat: pt?.lat, lng: pt?.lng,
      }));
      Object.assign(user, r.user);
      resetUser();
      toast('Details saved', 'success');
    } catch (err) { showFormError(f, err.message); }
  });
}

/* ------------------------------------------------------------------ Boot */
let tabsApi;
const bookingView = new URLSearchParams(location.search).get('bookings');
mountBookingList($('#panel-requests'), 'owner', {
  initialStatus: bookingView === 'active' || bookingView === 'history' ? bookingView : '',
});
tabsApi = mountTabs($('#tabs'), [
  { id: 'requests', label: 'Requests' }, { id: 'machines', label: 'My machines' }, { id: 'labour', label: 'Labour teams' },
  { id: 'customers', label: 'Customers' }, { id: 'profile', label: 'Profile' },
], (id) => {
  if (loaded.has(id)) return;
  loaded.add(id);
  if (id === 'machines') renderMachines();
  if (id === 'labour') renderLabour();
  if (id === 'customers') renderCustomers();
  if (id === 'profile') renderProfile();
});
loadStats();
$('#add-tool').addEventListener('click', () => openToolForm());
$('#add-labour').addEventListener('click', () => openLabourForm());
