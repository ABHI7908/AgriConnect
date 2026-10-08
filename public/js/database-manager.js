import { setupApp } from './lib/backdrop.js';
import { initPreferences } from './lib/preferences.js';

setupApp();
initPreferences(document.querySelector('.header-preferences'), { language: false, theme: true });

const $ = (selector) => document.querySelector(selector);
const loginView = $('#login-view');
const managerView = $('#manager-view');
const tableSelect = $('#table-select');
const records = $('#records');
const pager = $('#pager');
const summary = $('#table-summary');
const search = $('#search');
const dialog = $('#edit-dialog');
let current = { table: '', page: 1, pageSize: 25, total: 0, columns: [], items: [], readOnly: false };
let searchTimer;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function showError(target, message = '') {
  target.textContent = message;
  target.classList.toggle('hidden', !message);
}

async function request(url, options = {}) {
  const headers = { 'X-Requested-With': 'agriconnect', Accept: 'application/json', ...(options.headers || {}) };
  let body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`/api/database-manager${url}`, {
    method: options.method || 'GET',
    headers,
    body,
    credentials: 'same-origin',
  });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data;
}

function currentQuery() {
  const query = new URLSearchParams({ q: search.value.trim() });
  return query.toString();
}

function updateExport() {
  $('#export').href = `/api/database-manager/${encodeURIComponent(current.table)}/export?${currentQuery()}`;
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(current.total / current.pageSize));
  pager.innerHTML = `
    <button class="btn ghost small" type="button" data-page="${current.page - 1}" ${current.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${current.page} of ${totalPages}</span>
    <button class="btn ghost small" type="button" data-page="${current.page + 1}" ${current.page >= totalPages ? 'disabled' : ''}>Next</button>`;
  pager.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
    current.page = Number(button.dataset.page);
    loadRecords();
  }));
}

function renderRecords() {
  if (!current.items.length) {
    records.innerHTML = '<div class="empty"><h3>No records found</h3></div>';
    return;
  }
  const headers = current.columns.map((column) => `<th scope="col">${escapeHtml(column.name)}</th>`).join('');
  const rows = current.items.map((item) => `
    <tr>
      ${current.columns.map((column) => {
        const value = item[column.name];
        if (current.table === 'tool_images' && column.name === 'filename' && value) {
          const src = `/uploads/${encodeURIComponent(String(value))}`;
          return `<td><a href="${src}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a><img src="${src}" alt="Listing photo ${escapeHtml(value)}" loading="lazy" style="display:block;width:96px;height:64px;object-fit:cover;margin-top:.35rem;border-radius:4px"></td>`;
        }
        return `<td>${escapeHtml(value)}</td>`;
      }).join('')}
      <td><div class="db-actions">
        ${current.readOnly ? '' : `<button type="button" class="btn ghost small" data-edit="${item.id}">Edit</button><button type="button" class="btn danger small" data-delete="${item.id}">Delete</button>`}
      </div></td>
    </tr>`).join('');
  records.innerHTML = `<div class="db-table-wrap"><table><thead><tr>${headers}<th scope="col">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  records.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => editRecord(Number(button.dataset.edit))));
  records.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteRecord(Number(button.dataset.delete))));
}

async function loadRecords() {
  showError($('#manager-error'));
  records.innerHTML = '<div class="skeleton" style="min-height:120px"></div>';
  updateExport();
  try {
    const query = new URLSearchParams({ q: search.value.trim(), page: String(current.page), pageSize: String(current.pageSize) });
    const data = await request(`/${encodeURIComponent(current.table)}/rows?${query}`);
    current = { ...current, ...data, table: data.table.name, columns: data.table.columns, readOnly: data.table.readOnly };
    summary.textContent = `${data.total.toLocaleString()} records · ${data.table.label}${data.table.readOnly ? ' · read only' : ''}`;
    renderRecords();
    renderPage();
  } catch (err) {
    records.innerHTML = '';
    showError($('#manager-error'), err.message);
  }
}

function editRecord(id) {
  const row = current.items.find((item) => item.id === id);
  if (!row) return;
  $('#edit-id').textContent = `#${id}`;
  const fields = current.columns.filter((column) => column.writable);
  $('#edit-fields').innerHTML = fields.map((column) => {
    const value = row[column.name] ?? '';
    const multiline = /description|address|notes|review|polygon|admin_note/i.test(column.name);
    const numeric = /INT|REAL|FLOA|DOUB|NUM/i.test(column.type);
    const boolean = /^(active|available|with_operator|profile_complete)$/.test(column.name);
    let input;
    if (boolean) {
      input = `<select id="edit-${escapeHtml(column.name)}" name="${escapeHtml(column.name)}" ${column.nullable ? '' : 'required'}>
        <option value="1" ${Number(value) === 1 ? 'selected' : ''}>Yes / enabled</option>
        <option value="0" ${Number(value) === 0 ? 'selected' : ''}>No / disabled</option>
      </select>`;
    } else if (multiline) {
      input = `<textarea id="edit-${escapeHtml(column.name)}" name="${escapeHtml(column.name)}" ${numeric ? 'inputmode="decimal"' : ''} ${column.nullable ? '' : 'required'}>${escapeHtml(value)}</textarea>`;
    } else {
      input = `<input id="edit-${escapeHtml(column.name)}" name="${escapeHtml(column.name)}" type="text" value="${escapeHtml(value)}" ${numeric ? 'inputmode="decimal"' : ''} ${column.nullable ? '' : 'required'}>`;
    }
    return `<div class="field"><label for="edit-${escapeHtml(column.name)}">${escapeHtml(column.name)}${column.nullable ? '' : ' *'}</label>${input}</div>`;
  }).join('');
  $('#edit-error').classList.add('hidden');
  dialog.dataset.id = String(id);
  dialog.showModal();
}

$('#edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await request(`/${encodeURIComponent(current.table)}/${dialog.dataset.id}`, { method: 'PUT', json: body });
    dialog.close();
    await loadRecords();
  } catch (err) {
    showError($('#edit-error'), err.message);
  }
});

$('#cancel-edit').addEventListener('click', () => dialog.close());

async function deleteRecord(id) {
  const warning = current.table === 'users'
    ? 'Deleting this account can also permanently delete its listings, bookings, and saved calculations.'
    : 'This action cannot be undone.';
  if (!window.confirm(`Delete ${current.table} record #${id}?\n\n${warning}`)) return;
  try {
    await request(`/${encodeURIComponent(current.table)}/${id}`, { method: 'DELETE' });
    await loadRecords();
  } catch (err) {
    showError($('#manager-error'), err.message);
  }
}

async function showManager() {
  loginView.classList.add('hidden');
  managerView.classList.remove('hidden');
  const data = await request('/tables');
  tableSelect.innerHTML = data.items.map((item) =>
    `<option value="${escapeHtml(item.name)}">${escapeHtml(item.label)}</option>`).join('');
  current.table = tableSelect.value;
  await loadRecords();
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError($('#login-error'));
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await request('/login', {
      method: 'POST',
      json: { email: form.email.value, password: form.password.value },
    });
    form.reset();
    await showManager();
  } catch (err) {
    showError($('#login-error'), err.message);
  } finally {
    button.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  try {
    await request('/logout', { method: 'POST' });
  } finally {
    managerView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
});

tableSelect.addEventListener('change', () => {
  current.table = tableSelect.value;
  current.page = 1;
  loadRecords();
});

search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    current.page = 1;
    loadRecords();
  }, 300);
});

$('#refresh').addEventListener('click', loadRecords);

try {
  await request('/session');
  await showManager();
} catch {
  loginView.classList.remove('hidden');
}
