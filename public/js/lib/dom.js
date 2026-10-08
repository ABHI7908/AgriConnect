// Small DOM helpers. All dynamic text goes through html`` which escapes interpolations by default,
// so user-provided data (names, descriptions, notes) can never inject markup.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
/** Mark a string as already-safe HTML (only ever use on markup we generated ourselves). */
export const raw = (s) => new Raw(s);

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Set an element's content from html`` output, an array of it, or a plain string (escaped). */
export function setHTML(el, content) {
  el.innerHTML = render(content);
}

/** Delegated event listener: on(root, 'click', '[data-action]', (e, el) => ...) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const el = e.target instanceof Element ? e.target.closest(selector) : null;
    if (el && root.contains(el)) handler(e, el);
  });
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* ------------------------------------------------------------ Formatting */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : inr.format(n));
export const num = (n, d = 0) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function dateRange(a, b) { return a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`; }
export const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const label = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* ---------------------------------------------------------------- Toasts */
let toastHost;
export function toast(message, type = 'info', ms = 4200) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------------------------------------------------------- Dialogs */
/**
 * Open a modal built on <dialog>. Returns { dialog, body, close }.
 * `footer` is optional HTML for the sticky action bar.
 */
export function openModal({ title, body, footer, wide = false, onClose }) {
  const dialog = document.createElement('dialog');
  if (wide) dialog.classList.add('wide');
  dialog.innerHTML = `
    <div class="dlg-head"><h2></h2><button class="icon-btn" type="button" data-close aria-label="Close">&times;</button></div>
    <div class="dlg-body"></div>
    ${footer ? '<div class="dlg-foot"></div>' : ''}`;
  dialog.querySelector('h2').textContent = title;
  const bodyEl = dialog.querySelector('.dlg-body');
  setHTML(bodyEl, body);
  if (footer) setHTML(dialog.querySelector('.dlg-foot'), footer);

  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || (e.target instanceof Element && e.target.closest('[data-close]'))) close();
  });
  dialog.addEventListener('close', () => { dialog.remove(); if (onClose) onClose(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body: bodyEl, footer: dialog.querySelector('.dlg-foot'), close };
}

export function confirmDialog(message, { confirmText = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body: html`<p>${message}</p>`,
      footer: html`<button class="btn ghost" type="button" data-close>Cancel</button>
                   <button class="btn ${danger ? 'danger' : 'dark'}" type="button" data-ok>${confirmText}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    m.dialog.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); m.close(); });
  });
}

/** Ask for a short piece of text (e.g. a rejection reason or final amount). Resolves to the string or null. */
export function promptDialog({ title, message, label: lbl, type = 'text', value = '', confirmText = 'Save', required = true, inputProps = '' }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body: html`<form id="prompt-form" novalidate>
        ${message ? html`<p>${message}</p>` : ''}
        <div class="field"><label for="prompt-input">${lbl}</label>
        <input id="prompt-input" type="${type}" value="${value}" ${raw(inputProps)} autocomplete="off"></div>
        <div class="form-error hidden" id="prompt-err" role="alert"></div></form>`,
      footer: html`<button class="btn ghost" type="button" data-close>Cancel</button>
                   <button class="btn dark" type="submit" form="prompt-form">${confirmText}</button>`,
      onClose: () => { if (!answered) resolve(null); },
    });
    const form = m.dialog.querySelector('#prompt-form');
    const input = m.dialog.querySelector('#prompt-input');
    input.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (required && !v) {
        const err = m.dialog.querySelector('#prompt-err');
        err.textContent = 'This field is required';
        err.classList.remove('hidden');
        return;
      }
      answered = true;
      resolve(v);
      m.close();
    });
  });
}

/* ---------------------------------------------------------------- Buttons */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(btn.dataset.busyText || 'Please wait')}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = original;
  }
}

/** Show a form-level error message (creates the container if missing). */
export function showFormError(form, message) {
  let box = form.querySelector('.form-error');
  if (!message) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'form-error';
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  box.textContent = message;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export const stars = (rating) =>
  rating && rating.count
    ? html`<span class="stars" title="${rating.count} review${rating.count === 1 ? '' : 's'}">★ ${rating.average.toFixed(1)} <small class="muted">(${rating.count})</small></span>`
    : html`<span class="stars"><span class="none">No reviews yet</span></span>`;

export function pagerHTML({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return html`<div class="pager">
    <span class="muted">Page ${page} of ${pages} · ${num(total)} total</span>
    <span class="row">
      <button class="btn ghost small" data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''}>Previous</button>
      <button class="btn ghost small" data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''}>Next</button>
    </span></div>`;
}
