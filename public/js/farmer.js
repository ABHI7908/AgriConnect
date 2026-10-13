// Farmer dashboard: bookings, history of services used, saved yield calculations, profile.
import { api } from './lib/api.js';
import { requireRole, resetUser } from './lib/session.js';
import { $, html, setHTML, on, money, num, fmtDate, toast, withBusy, showFormError, confirmDialog } from './lib/dom.js';
import { mountBookingList } from './lib/bookings-ui.js';
import { mountTabs } from './lib/tabs.js';

const user = await requireRole('farmer', 'farmer');
$('#greet').textContent = user.name ? `Namaste, ${user.name.split(' ')[0]}` : 'My farm';

const loaded = new Set();

async function loadStats() {
  try {
    const s = await api.get('/bookings/summary');
    setHTML($('#stats'), html`
      <div class="stat"><div class="n">${num(s.totals.total)}</div><div class="l">Requests made</div></div>
      <div class="stat"><div class="n">${num(s.totals.completed)}</div><div class="l">Jobs completed</div></div>
      <div class="stat"><div class="n">${num(s.providers.length)}</div><div class="l">Providers used</div></div>
      <div class="stat"><div class="n">${money(s.totals.spent)}</div><div class="l">Spent on completed jobs</div></div>`);
    return s;
  } catch (err) { toast(err.message, 'error'); return null; }
}

async function renderHistory() {
  const host = $('#panel-history');
  setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
  try {
    const s = await api.get('/bookings/summary');
    if (!s.providers.length) {
      setHTML(host, html`<div class="empty"><h3>No services used yet</h3><p>Once an owner accepts your request, they appear here with the services you used.</p></div>`);
      return;
    }
    setHTML(host, html`<p class="muted">Machine owners and labour providers you have worked with, and what they did for you.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Provider</th><th>Services used</th><th class="num">Jobs</th><th class="num">Completed</th><th class="num">Paid</th><th>Last used</th></tr></thead>
        <tbody>${s.providers.map((p) => html`<tr><td><strong>${p.name}</strong>${p.village ? html`<br><span class="muted small">${p.village}</span>` : ''}</td>
          <td>${p.services.join(', ')}</td><td class="num">${p.bookings}</td><td class="num">${p.completed}</td><td class="num">${money(p.spent)}</td><td class="nowrap">${fmtDate(p.lastUsed)}</td></tr>`)}</tbody>
      </table></div>`);
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); }
}

async function renderSaved() {
  const host = $('#panel-saved');
  setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
  try {
    const { items } = await api.get('/calculator/saved');
    if (!items.length) {
      setHTML(host, html`<div class="empty"><h3>No saved calculations</h3><p>Measure your land with GPS and estimate your harvest, then save it.</p><a class="btn" href="/calculator">Open calculator</a></div>`);
      return;
    }
    setHTML(host, html`<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Crop</th><th class="num">Land (acres)</th><th class="num">Yield</th><th class="num">Bags</th><th class="num">Value</th><th>Saved</th><th></th></tr></thead>
      <tbody>${items.map((r) => html`<tr><td><strong>${r.label}</strong></td><td>${r.crop}</td><td class="num">${num(r.areaAcres, 2)}</td>
        <td class="num">${num(r.totalKg / 100, 1)} qtl</td><td class="num">${num(r.bags, 1)} × ${r.bagWeightKg} kg</td><td class="num">${r.revenue != null ? money(r.revenue) : '—'}</td>
        <td class="nowrap">${fmtDate(r.createdAt)}</td><td><button class="btn ghost small" data-del="${r.id}">Delete</button></td></tr>`)}</tbody>
    </table></div><p style="margin-top:1rem"><a class="btn" href="/calculator">New calculation</a></p>`);
  } catch (err) { setHTML(host, html`<div class="form-error">${err.message}</div>`); }
}
on($('#panel-saved'), 'click', '[data-del]', async (e, el) => {
  if (!(await confirmDialog('Delete this saved calculation?', { confirmText: 'Delete', danger: true }))) return;
  try { await api.del(`/calculator/saved/${el.dataset.del}`); renderSaved(); } catch (err) { toast(err.message, 'error'); }
});

function renderProfile() {
  const host = $('#panel-profile');
  setHTML(host, html`<form id="pf" class="plot" style="max-width:560px" novalidate>
    <h2 style="font-size:1.4rem">My details</h2>
    <p class="muted">Mobile: <strong>${user.phone}</strong> (used to log in)${user.email ? html` · Email: <strong>${user.email}</strong>` : ''}</p>
    <div class="form-grid">
      <div class="field full"><label for="n">Name</label><input id="n" name="name" type="text" maxlength="80" value="${user.name || ''}" required></div>
      <div class="field"><label for="v">Village / town</label><input id="v" name="village" type="text" maxlength="80" value="${user.village || ''}"></div>
      <div class="field"><label for="d">District</label><input id="d" name="district" type="text" maxlength="80" value="${user.district || ''}"></div>
      <div class="field"><label for="s">State</label><input id="s" name="state" type="text" maxlength="80" value="${user.state || ''}"></div>
      <div class="field full"><label for="a">Address (optional)</label><textarea id="a" name="address" maxlength="300">${user.address || ''}</textarea></div>
    </div>
    <button class="btn" type="submit" data-busy-text="Saving">Save changes</button>
  </form>`);
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    showFormError(f, '');
    try {
      const r = await withBusy(f.querySelector('button[type=submit]'), () => api.put('/auth/me', {
        name: f.name.value.trim(), village: f.village.value.trim() || undefined, district: f.district.value.trim() || undefined,
        state: f.state.value.trim() || undefined, address: f.address.value.trim() || undefined,
      }));
      Object.assign(user, r.user);
      resetUser();
      toast('Details saved', 'success');
    } catch (err) { showFormError(f, err.message); }
  });
}

const bookingView = new URLSearchParams(location.search).get('bookings');
mountBookingList($('#panel-bookings'), 'farmer', {
  initialStatus: bookingView === 'active' || bookingView === 'history' ? bookingView : '',
});
mountTabs($('#tabs'), [
  { id: 'bookings', label: 'My requests' }, { id: 'history', label: 'Services used' },
  { id: 'saved', label: 'Saved calculations' }, { id: 'profile', label: 'Profile' },
], (id) => {
  if (loaded.has(id)) return;
  loaded.add(id);
  if (id === 'history') renderHistory();
  if (id === 'saved') renderSaved();
  if (id === 'profile') renderProfile();
});
loadStats();
