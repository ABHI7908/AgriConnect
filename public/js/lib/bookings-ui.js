// Booking list + actions shared by the farmer and owner dashboards.
import { api } from './api.js';
import {
  html, raw, setHTML, on, money, dateRange, fmtDateTime, label, toast, confirmDialog, promptDialog, openModal,
  withBusy, pagerHTML,
} from './dom.js';

export const STATUS_FILTERS = [
  ['', 'All'], ['requested', 'Requested'], ['accepted', 'Accepted'], ['in_progress', 'In progress'],
  ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled'],
];

function actionsFor(b, role) {
  const btn = (act, text, cls = 'ghost') => html`<button type="button" class="btn small ${cls}" data-act="${act}" data-id="${b.id}">${text}</button>`;
  if (role === 'owner') {
    if (b.status === 'requested') return [btn('accepted', 'Accept', 'dark'), btn('rejected', 'Decline')];
    if (b.status === 'accepted') return [btn('in_progress', 'Start work', 'dark'), btn('completed', 'Mark completed'), btn('cancelled', 'Cancel')];
    if (b.status === 'in_progress') return [btn('completed', 'Mark completed', 'dark')];
    return [];
  }
  if (b.status === 'requested' || b.status === 'accepted') return [btn('cancelled', 'Cancel request')];
  if (b.status === 'completed' && !b.rating) return [btn('review', 'Rate this service', 'dark')];
  return [];
}

export function bookingCard(b, role) {
  const who = role === 'farmer' ? 'Provided by' : 'Requested by';
  const c = b.counterpart;
  const amount = b.finalAmount ?? b.quotedAmount;
  return html`<article class="plot booking" aria-label="${b.itemTitle}">
    <div class="head"><h3>${b.itemTitle}</h3><span class="badge ${b.status}">${label(b.status)}</span></div>
    <div class="facts">
      <span>${b.kind === 'labour' ? 'Labour' : 'Machine'}</span>
      <span><strong>${dateRange(b.startDate, b.endDate)}</strong></span>
      ${b.landAcres ? html`<span><strong>${b.landAcres}</strong> acres</span>` : ''}
      <span>${b.finalAmount != null ? 'Final' : 'Estimate'}: <strong>${money(amount)}</strong></span>
      <span>${who}: <strong>${c.name || 'User'}</strong>${c.village ? ` (${c.village}${c.district ? `, ${c.district}` : ''})` : ''}</span>
    </div>
    ${b.workAddress ? html`<p class="note"><strong>Work location:</strong> ${b.workAddress}</p>` : ''}
    ${b.notes ? html`<p class="note">${b.notes}</p>` : ''}
    ${c.phone ? html`<div class="contact">Phone: <a href="tel:${c.phone}">${c.phone}</a></div>` : ''}
    ${b.rating ? html`<div class="stars">${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)} <span class="muted">${b.review || ''}</span></div>` : ''}
    <div class="row between"><span class="muted small">Requested ${fmtDateTime(b.createdAt)}</span><span class="row">${actionsFor(b, role)}</span></div>
  </article>`;
}

async function changeStatus(id, status, role) {
  if (status === 'rejected') {
    const reason = await confirmDialog('Decline this request? The farmer will see it as rejected.', { confirmText: 'Decline', danger: true });
    if (!reason) return false;
  } else if (status === 'cancelled') {
    if (!(await confirmDialog('Cancel this booking?', { confirmText: 'Yes, cancel', danger: true }))) return false;
  }
  let finalAmount;
  if (status === 'completed' && role === 'owner') {
    const v = await promptDialog({
      title: 'Complete this job', message: 'Enter the final amount charged (leave as is to use the estimate).',
      label: 'Final amount (INR)', type: 'number', inputProps: 'min="0" step="1" inputmode="numeric"', confirmText: 'Mark completed', required: false,
    });
    if (v === null) return false;
    finalAmount = v === '' ? undefined : Number(v);
  }
  await api.patch(`/bookings/${id}/status`, { status, finalAmount });
  return true;
}

function reviewDialog(id) {
  return new Promise((resolve) => {
    const m = openModal({
      title: 'Rate this service',
      body: html`<form id="rv-form" novalidate>
        <fieldset class="field"><legend>Your rating</legend>
          <div class="chips" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`<label class="chip" style="display:inline-flex;gap:.3rem"><input type="radio" name="rating" value="${n}" ${n === 5 ? raw('checked') : ''}> ${n} ★</label>`)}</div></fieldset>
        <div class="field"><label for="rv-text">Comment (optional)</label><textarea id="rv-text" name="review" maxlength="600"></textarea></div>
        <div class="form-error hidden" id="rv-err" role="alert"></div></form>`,
      footer: html`<button class="btn ghost" type="button" data-close>Not now</button><button class="btn dark" type="submit" form="rv-form">Submit review</button>`,
      onClose: () => resolve(false),
    });
    m.dialog.querySelector('#rv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      try {
        await api.post(`/bookings/${id}/review`, { rating: f.rating.value, review: f.review.value.trim() || undefined });
        toast('Thank you for your review', 'success');
        m.close();
        resolve(true);
      } catch (err) {
        const box = m.dialog.querySelector('#rv-err');
        box.textContent = err.message;
        box.classList.remove('hidden');
      }
    });
  });
}

/** Mount a filterable, paged booking list into `host`. */
export function mountBookingList(host, role, { initialStatus = '' } = {}) {
  const st = { status: initialStatus, page: 1 };

  async function load() {
    setHTML(host, html`<div class="skeleton" style="min-height:120px"></div>`);
    try {
      const data = await api.get('/bookings', { status: st.status, page: st.page, pageSize: 10 });
      setHTML(host, html`
        <div class="chips" role="group" aria-label="Filter by status" style="margin-bottom:1rem">
          ${STATUS_FILTERS.map(([v, t]) => html`<button type="button" class="chip" data-filter="${v}" aria-pressed="${st.status === v}">${t}</button>`)}
        </div>
        ${data.items.length ? data.items.map((b) => bookingCard(b, role)) : html`<div class="empty"><h3>No bookings here yet</h3><p>${role === 'farmer' ? 'Find a machine or labour team near you and send a request.' : 'Requests from farmers will appear here.'}</p>${role === 'farmer' ? html`<a class="btn" href="/">Find machines</a>` : ''}</div>`}
        ${data.total > data.pageSize ? pagerHTML(data) : ''}`);
    } catch (err) {
      setHTML(host, html`<div class="form-error">${err.message}</div>`);
    }
  }

  on(host, 'click', '[data-filter]', (e, el) => { st.status = el.dataset.filter; st.page = 1; load(); });
  on(host, 'click', '[data-page]', (e, el) => { st.page = Number(el.dataset.page); load(); });
  on(host, 'click', '[data-act]', async (e, el) => {
    const { act, id } = el.dataset;
    try {
      const changed = act === 'review'
        ? await reviewDialog(id)
        : await withBusy(el, () => changeStatus(id, act, role));
      if (changed) { if (act !== 'review') toast(`Booking ${label(act).toLowerCase()}`, 'success'); load(); }
    } catch (err) { toast(err.message, 'error', 6000); }
  });

  load();
  return { reload: load };
}
