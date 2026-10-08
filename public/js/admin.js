// Admin panel: overview, listing moderation, user management (block / history), bookings, audit log, crop table.
import { api } from './lib/api.js';
import { requireRole, resetUser } from './lib/session.js';
import {
  $, html, raw, setHTML, on, money, num, label, fmtDate, fmtDateTime, dateRange, toast, withBusy, showFormError,
  confirmDialog, promptDialog, openModal, pagerHTML, debounce, esc,
} from './lib/dom.js';
import { mountTabs } from './lib/tabs.js';

const phoneLink = (p) => (p ? html`<a href="tel:${p}">${p}</a>` : '—');
const place = (x) => [x.village, x.district].filter(Boolean).join(', ') || '—';

/**
 * Generic filterable, paged table.
 * cfg: { path, filters:[{name,type,options?,placeholder?,value?}], head:[...], row(item), empty }
 */
function listView(host, cfg) {
  const st = { page: 1, values: Object.fromEntries((cfg.filters || []).map((f) => [f.name, f.value ?? ''])) };
  setHTML(host, html`${cfg.intro || ''}
    <form class="row" style="margin-bottom:1rem" data-filters>${(cfg.filters || []).map((f) => (f.type === 'search'
      ? html`<label class="sr-only" for="${host.id}-${f.name}">${f.placeholder}</label><input id="${host.id}-${f.name}" data-f="${f.name}" type="search" placeholder="${f.placeholder}" value="${st.values[f.name]}" style="width:min(100%,260px)">`
      : html`<label class="sr-only" for="${host.id}-${f.name}">${f.label}</label><select id="${host.id}-${f.name}" data-f="${f.name}" style="width:auto">${f.options.map(([v, t]) => html`<option value="${v}" ${st.values[f.name] === v ? raw('selected') : ''}>${t}</option>`)}</select>`))}
      ${cfg.toolbar || ''}</form><div data-body></div>`);
  const body = host.querySelector('[data-body]');
  host.querySelector('[data-filters]').addEventListener('submit', (e) => e.preventDefault());

  async function load() {
    setHTML(body, html`<div class="skeleton" style="min-height:120px"></div>`);
    try {
      const data = await api.get(cfg.path, { ...st.values, page: st.page, pageSize: cfg.pageSize || 15 });
      cfg.data = data;
      setHTML(body, data.items.length
        ? html`<div class="table-wrap"><table><thead><tr>${cfg.head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${data.items.map(cfg.row)}</tbody></table></div>${data.total > data.pageSize ? pagerHTML(data) : ''}`
        : html`<div class="empty"><h3>${cfg.empty || 'Nothing here'}</h3></div>`);
    } catch (err) { setHTML(body, html`<div class="form-error">${err.message}</div>`); }
  }
  const reset = () => { st.page = 1; load(); };
  on(host, 'change', 'select[data-f]', (e, el) => { st.values[el.dataset.f] = el.value; reset(); });
  host.addEventListener('input', debounce((e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.dataset.f) { st.values[el.dataset.f] = el.value.trim(); reset(); }
  }, 350));
  on(host, 'click', '[data-page]', (e, el) => { st.page = Number(el.dataset.page); load(); });
  load();
  return { reload: load, host, items: () => cfg.data?.items || [] };
}

/* -------------------------------------------------------------- Overview */
async function overview() {
  const host = $('#panel-overview');
  setHTML(host, html`<div class="skeleton" style="min-height:160px"></div>`);
  try {
    const s = await api.get('/admin/stats');
    const pending = s.tools.pending + s.labour.pending;
    const maxN = Math.max(1, ...s.signupsLast14Days.map((d) => d.n));
    setHTML(host, html`
      <div class="grid cols-4">
        <div class="stat"><div class="n">${num(s.users.farmers.total)}</div><div class="l">Farmers (${s.users.farmers.blocked} blocked)</div></div>
        <div class="stat"><div class="n">${num(s.users.owners.total)}</div><div class="l">Owners / providers (${s.users.owners.blocked} blocked)</div></div>
        <div class="stat ${pending ? 'alert' : ''}"><div class="n">${num(pending)}</div><div class="l">Listings awaiting approval</div></div>
        <div class="stat"><div class="n">${num(s.tools.approved)}</div><div class="l">Live machines (${s.tools.total} total)</div></div>
        <div class="stat"><div class="n">${num(s.labour.total)}</div><div class="l">Labour listings</div></div>
        <div class="stat"><div class="n">${num(s.bookings.total)}</div><div class="l">Bookings</div></div>
        <div class="stat"><div class="n">${money(s.bookings.completedValue)}</div><div class="l">Completed job value</div></div>
        <div class="stat"><div class="n">${num(s.logins24h)}</div><div class="l">Logins, last 24 h</div></div>
      </div>
      <div class="grid cols-2" style="margin-top:1.25rem">
        <div class="plot"><h3>Bookings by status</h3><div class="row">${Object.entries(s.bookings.byStatus).map(([k, v]) => html`<span class="badge ${k}">${label(k)}: ${v}</span>`)}</div></div>
        <div class="plot"><h3>New sign-ups, last 14 days</h3>
          ${s.signupsLast14Days.length ? html`<div class="bars" role="img" aria-label="Daily sign-ups">${s.signupsLast14Days.map((d) => html`<i style="height:${Math.max(3, (d.n / maxN) * 100)}%" title="${d.day}: ${d.n}"></i>`)}</div>` : html`<p class="muted">No sign-ups in this period.</p>`}</div>
      </div>`);
    tabs.setCount('moderation', pending || '');
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); }
}

/* ------------------------------------------------------------ Moderation */
async function moderate(kind, id, status, name) {
  let note;
  if (status === 'rejected') {
    note = await promptDialog({ title: `Reject “${name}”`, label: 'Reason shown to the owner', confirmText: 'Reject listing' });
    if (!note) return false;
  }
  await api.patch(`/admin/${kind}/${id}/status`, { status, note });
  return true;
}

function moderationView() {
  const host = $('#panel-moderation');
  setHTML(host, html`<div class="segmented" role="group" aria-label="Listing type" style="margin-bottom:1rem">
    <button type="button" data-kind="tools" aria-pressed="true">Machines</button><button type="button" data-kind="labour" aria-pressed="false">Labour teams</button></div>
    <div id="mod-list"></div>`);
  let view;
  const mount = (kind) => {
    const tools = kind === 'tools';
    view = listView($('#mod-list'), {
      path: `/admin/${kind}`,
      filters: [
        { name: 'status', type: 'select', label: 'Status', value: 'pending', options: [['', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] },
        ...(tools ? [{ name: 'q', type: 'search', placeholder: 'Search name, brand, owner, phone' }] : []),
      ],
      head: [tools ? 'Machine' : 'Team', 'Owner', 'Price', 'Location', 'Status', ''],
      empty: 'No listings match',
      row: (x) => html`<tr>
        <td>${tools && x.images[0] ? raw(`<img src="${esc(x.images[0].url)}" alt="" width="64" height="48" style="object-fit:cover;border-radius:3px;float:left;margin-right:.6rem">`) : ''}
          <strong>${x.name || x.title}</strong><br><span class="muted small">${tools ? `${label(x.category)} · ${x.images.length} photo(s)` : `${label(x.skill)} · team of ${x.teamSize}`}</span>
          ${x.adminNote ? html`<br><span class="small">Note: ${x.adminNote}</span>` : ''}</td>
        <td>${x.ownerName || x.providerName}<br>${phoneLink(x.ownerPhone || x.providerPhone)}</td>
        <td class="nowrap">${tools ? [x.pricePerDay && `${money(x.pricePerDay)}/day`, x.pricePerHour && `${money(x.pricePerHour)}/hr`, x.pricePerAcre && `${money(x.pricePerAcre)}/acre`].filter(Boolean).join(', ') : `${money(x.wagePerDay)}/person/day`}</td>
        <td>${place(x)}</td><td><span class="badge ${x.status}">${label(x.status)}</span></td>
        <td><div class="actions">
          ${tools && x.images.length ? html`<button class="btn ghost small" data-photos="${x.id}">Photos</button>` : ''}
          ${x.status !== 'approved' ? html`<button class="btn dark small" data-mod="approved" data-id="${x.id}" data-name="${x.name || x.title}">Approve</button>` : ''}
          ${x.status !== 'rejected' ? html`<button class="btn ghost small" data-mod="rejected" data-id="${x.id}" data-name="${x.name || x.title}">Reject</button>` : ''}
          <button class="btn ghost small" data-delete="${x.id}" data-name="${x.name || x.title}">Delete</button></div></td></tr>`,
    });
    view.kind = kind;
  };
  mount('tools');
  on(host, 'click', '[data-kind]', (e, el) => {
    host.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    mount(el.dataset.kind);
  });
  on(host, 'click', '[data-mod]', async (e, el) => {
    try { if (await withBusy(el, () => moderate(view.kind, el.dataset.id, el.dataset.mod, el.dataset.name))) { toast(`Listing ${el.dataset.mod}`, 'success'); view.reload(); overview(); } } catch (err) { toast(err.message, 'error', 6000); }
  });
  on(host, 'click', '[data-delete]', async (e, el) => {
    if (!(await confirmDialog(`Permanently delete “${el.dataset.name}”?`, { confirmText: 'Delete', danger: true }))) return;
    try { await api.del(`/admin/${view.kind}/${el.dataset.delete}`); toast('Deleted', 'success'); view.reload(); overview(); } catch (err) { toast(err.message, 'error', 6000); }
  });
  on(host, 'click', '[data-photos]', (e, el) => {
    const t = view.items().find((i) => i.id === Number(el.dataset.photos));
    if (t) openModal({ title: `${t.name}: photos`, wide: true, body: html`<div class="preview-grid">${t.images.map((im) => html`<a href="${im.url}" target="_blank" rel="noopener"><img src="${im.url}" alt="Listing photo" style="width:260px;height:195px;object-fit:cover;border-radius:4px"></a>`)}</div>` });
  });
}
/* ----------------------------------------------------------------- Users */
async function userDetail(id) {
  let d;
  try { d = await api.get(`/admin/users/${id}`); } catch (err) { toast(err.message, 'error'); return; }
  const u = d.user;
  openModal({
    title: `${u.name || 'Unnamed'} (${label(u.role)})`, wide: true,
    body: html`<dl class="specs"><dt>Phone</dt><dd>${phoneLink(u.phone)}</dd><dt>Business</dt><dd>${u.businessName || '—'}</dd>
      <dt>Location</dt><dd>${[u.village, u.district, u.state].filter(Boolean).join(', ') || '—'}${u.lat != null ? ` (${u.lat.toFixed(4)}, ${u.lng.toFixed(4)})` : ''}</dd>
      <dt>Status</dt><dd><span class="badge ${u.status}">${label(u.status)}</span></dd><dt>Joined</dt><dd>${fmtDateTime(u.createdAt)}</dd><dt>Last login</dt><dd>${fmtDateTime(u.lastLoginAt)}</dd></dl>
      ${d.tools.length ? html`<h3>Machines (${d.tools.length})</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>${d.tools.map((t) => html`<tr><td>${t.name}</td><td>${label(t.category)}</td><td><span class="badge ${t.status}">${label(t.status)}</span></td></tr>`)}</tbody></table></div>` : ''}
      <h3 style="margin-top:1rem">Service history (${d.bookings.length})</h3>
      ${d.bookings.length ? html`<div class="table-wrap"><table><thead><tr><th>Service</th><th>Farmer</th><th>Provider</th><th>Dates</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${d.bookings.map((b) => html`<tr><td>${b.item_title}</td><td>${b.farmer_name || '—'}</td><td>${b.owner_name || '—'}</td><td class="nowrap">${dateRange(b.start_date, b.end_date)}</td><td class="num">${money(b.final_amount ?? b.quoted_amount)}</td><td><span class="badge ${b.status}">${label(b.status)}</span></td></tr>`)}</tbody></table></div>` : html`<p class="muted">No bookings.</p>`}
      <h3 style="margin-top:1rem">Recent activity</h3>
      ${d.recentActivity.length ? html`<ul>${d.recentActivity.map((a) => html`<li><code>${a.action}</code> <span class="muted small">${fmtDateTime(a.created_at)} · ${a.ip || ''}</span></li>`)}</ul>` : html`<p class="muted">None.</p>`}`,
  });
}

function usersView() {
  const host = $('#panel-users');
  const v = listView(host, {
    path: '/admin/users',
    filters: [
      { name: 'role', type: 'select', label: 'Role', options: [['', 'All roles'], ['farmer', 'Farmers'], ['owner', 'Owners / providers']] },
      { name: 'status', type: 'select', label: 'Status', options: [['', 'Any status'], ['active', 'Active'], ['blocked', 'Blocked']] },
      { name: 'q', type: 'search', placeholder: 'Search name, phone, village' },
    ],
    head: ['User', 'Role', 'Phone', 'Location', 'Machines', 'Bookings', 'Last login', 'Status', ''],
    empty: 'No users match',
    row: (u) => html`<tr><td><strong>${u.name || 'Not set up'}</strong></td><td>${label(u.role)}</td><td>${phoneLink(u.phone)}</td><td>${place(u)}</td>
      <td class="num">${u.role === 'owner' ? u.toolCount : '—'}</td><td class="num">${u.bookingCount}</td><td class="nowrap">${fmtDate(u.lastLoginAt)}</td>
      <td><span class="badge ${u.status}">${label(u.status)}</span></td>
      <td><div class="actions"><button class="btn ghost small" data-view="${u.id}">View</button>
        <button class="btn ${u.status === 'active' ? 'ghost' : 'dark'} small" data-block="${u.id}" data-to="${u.status === 'active' ? 'blocked' : 'active'}" data-name="${u.name || u.phone}">${u.status === 'active' ? 'Block' : 'Unblock'}</button></div></td></tr>`,
  });
  on(host, 'click', '[data-view]', (e, el) => userDetail(el.dataset.view));
  on(host, 'click', '[data-block]', async (e, el) => {
    const to = el.dataset.to;
    let reason;
    if (to === 'blocked') {
      reason = await promptDialog({ title: `Block ${el.dataset.name}`, message: 'They are signed out immediately and cannot log in until unblocked.', label: 'Reason (kept in the audit log)', confirmText: 'Block user', required: false });
      if (reason === null) return;
    } else if (!(await confirmDialog(`Unblock ${el.dataset.name}?`, { confirmText: 'Unblock' }))) return;
    try { await api.patch(`/admin/users/${el.dataset.block}/status`, { status: to, reason: reason || undefined }); toast(`User ${to === 'blocked' ? 'blocked' : 'unblocked'}`, 'success'); v.reload(); } catch (err) { toast(err.message, 'error', 6000); }
  });
}

/* -------------------------------------------------------------- Bookings */
function bookingsView() {
  listView($('#panel-bookings'), {
    path: '/admin/bookings',
    filters: [
      { name: 'status', type: 'select', label: 'Status', options: [['', 'All statuses'], ['requested', 'Requested'], ['accepted', 'Accepted'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']] },
      { name: 'kind', type: 'select', label: 'Type', options: [['', 'Machines and labour'], ['tool', 'Machines'], ['labour', 'Labour']] },
      { name: 'q', type: 'search', placeholder: 'Search service, farmer, owner, phone' },
    ],
    head: ['Service', 'Farmer (customer)', 'Provider', 'Dates', 'Amount', 'Status', 'Rating'],
    empty: 'No bookings match',
    row: (b) => html`<tr><td><strong>${b.item_title}</strong><br><span class="muted small">${b.kind === 'labour' ? 'Labour' : 'Machine'}${b.land_acres ? ` · ${b.land_acres} acres` : ''}</span></td>
      <td>${b.farmer_name || '—'}<br>${phoneLink(b.farmer_phone)}</td><td>${b.owner_name || '—'}<br>${phoneLink(b.owner_phone)}</td>
      <td class="nowrap">${dateRange(b.start_date, b.end_date)}</td><td class="num">${money(b.final_amount ?? b.quoted_amount)}</td>
      <td><span class="badge ${b.status}">${label(b.status)}</span></td><td>${b.rating ? `${b.rating} ★` : '—'}</td></tr>`,
  });
}

/* ------------------------------------------------------------- Audit log */
function auditView() {
  listView($('#panel-audit'), {
    path: '/admin/audit', pageSize: 25,
    filters: [{ name: 'action', type: 'search', placeholder: 'Action starts with… (e.g. auth, booking, admin)' }],
    head: ['When', 'Who', 'Action', 'Entity', 'IP', 'Details'],
    empty: 'No log entries',
    row: (a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.actorName || (a.actorRole ? label(a.actorRole) : 'System')}${a.actorId ? html` <span class="muted small">#${a.actorId}</span>` : ''}</td>
      <td><code>${a.action}</code></td><td>${a.entity ? `${a.entity} #${a.entityId ?? ''}` : '—'}</td><td class="small">${a.ip || ''}</td>
      <td class="small">${a.meta ? JSON.stringify(a.meta).slice(0, 140) : ''}</td></tr>`,
  });
}

/* ----------------------------------------------------------------- Crops */
function cropForm(c) {
  const m = openModal({
    title: c ? `Edit ${c.name}` : 'Add crop',
    body: html`<form id="crop-form" novalidate>
      <div class="field"><label for="k-name">Crop name</label><input id="k-name" name="name" maxlength="80" required value="${c?.name || ''}"></div>
      <div class="form-grid"><div class="field"><label for="k-yield">Average yield (kg per acre)</label><input id="k-yield" name="yieldPerAcreKg" type="number" min="1" step="any" required value="${c?.yieldPerAcreKg ?? ''}"></div>
      <div class="field"><label for="k-price">Indicative price (INR per quintal)</label><input id="k-price" name="defaultPricePerQuintal" type="number" min="0" step="any" value="${c?.defaultPricePerQuintal ?? ''}"></div></div>
      <div class="field"><label for="k-notes">Notes</label><input id="k-notes" name="notes" maxlength="200" value="${c?.notes || ''}"></div>
      <label class="check"><input type="checkbox" name="active" ${!c || c.active ? raw('checked') : ''}> Show in the calculator</label></form>`,
    footer: html`<button class="btn ghost" type="button" data-close>Cancel</button><button class="btn dark" type="submit" form="crop-form" data-busy-text="Saving">Save</button>`,
  });
  const f = m.dialog.querySelector('#crop-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(f, '');
    const body = { name: f.name.value.trim(), yieldPerAcreKg: f.yieldPerAcreKg.value, defaultPricePerQuintal: f.defaultPricePerQuintal.value, notes: f.notes.value.trim() || undefined, active: f.active.checked };
    try {
      await withBusy(m.footer.querySelector('[type=submit]'), () => (c ? api.put(`/admin/crops/${c.id}`, body) : api.post('/admin/crops', body)));
      m.close();
      cropsView();
    } catch (err) { showFormError(f, err.message); }
  });
}

async function cropsView() {
  const host = $('#panel-crops');
  try {
    const { items } = await api.get('/admin/crops');
    setHTML(host, html`<div class="row between" style="margin-bottom:1rem"><p class="muted" style="margin:0">Averages used by the yield calculator. Farmers can override them.</p><button class="btn" id="add-crop">Add crop</button></div>
      <div class="table-wrap"><table><thead><tr><th>Crop</th><th class="num">kg / acre</th><th class="num">INR / quintal</th><th>Notes</th><th>Shown</th><th></th></tr></thead>
      <tbody>${items.map((c) => html`<tr><td><strong>${c.name}</strong></td><td class="num">${num(c.yieldPerAcreKg)}</td><td class="num">${c.defaultPricePerQuintal != null ? num(c.defaultPricePerQuintal) : '—'}</td><td>${c.notes || ''}</td>
        <td>${c.active ? 'Yes' : 'No'}</td><td><button class="btn ghost small" data-edit-crop="${c.id}">Edit</button></td></tr>`)}</tbody></table></div>`);
    host.querySelector('#add-crop').addEventListener('click', () => cropForm());
    on(host, 'click', '[data-edit-crop]', (e, el) => cropForm(items.find((c) => c.id === Number(el.dataset.editCrop))));
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); }
}

/* ------------------------------------------------------------------ Boot */
let tabs;
function start() {
  const loaded = new Set();
  tabs = mountTabs($('#tabs'), [
    { id: 'overview', label: 'Overview' }, { id: 'moderation', label: 'Listings to review' }, { id: 'users', label: 'Users' },
    { id: 'bookings', label: 'Bookings' }, { id: 'audit', label: 'Activity log' }, { id: 'crops', label: 'Crops' },
  ], (id) => {
    if (id === 'overview') { overview(); return; }
    if (loaded.has(id)) return;
    loaded.add(id);
    ({ moderation: moderationView, users: usersView, bookings: bookingsView, audit: auditView, crops: cropsView })[id]();
  });
}

/* ------------------------------------------------------------- Entry */
const user = await requireRole('admin', 'admin');
if (!user) {
  $('#login').classList.remove('hidden');
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    showFormError(f, '');
    try {
      await withBusy(f.querySelector('button[type=submit]'), () => api.post('/auth/admin/login', { email: f.email.value, password: f.password.value }));
      resetUser();
      location.reload();
    } catch (err) { showFormError(f, err.message); }
  });
  $('#a-email').focus();
} else {
  $('#dash').classList.remove('hidden');
  start();
}
