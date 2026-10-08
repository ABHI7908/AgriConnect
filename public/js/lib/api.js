// Thin fetch wrapper: JSON in/out, cookie session, CSRF header, uniform errors.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildQuery(query) {
  if (!query) return '';
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, url, { json, form, query } = {}) {
  const headers = { 'X-Requested-With': 'agriconnect', Accept: 'application/json' };
  let body;
  if (form) {
    body = form; // browser sets the multipart boundary
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(`/api${url}${buildQuery(query)}`, { method, headers, body, credentials: 'same-origin' });
  } catch (_) {
    throw new ApiError(0, 'NETWORK', 'No internet connection. Check your network and try again.');
  }

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json().catch(() => null);

  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

export const api = {
  get: (url, query) => request('GET', url, { query }),
  post: (url, json) => request('POST', url, { json }),
  put: (url, json) => request('PUT', url, { json }),
  patch: (url, json) => request('PATCH', url, { json }),
  del: (url) => request('DELETE', url),
  postForm: (url, form) => request('POST', url, { form }),
  putForm: (url, form) => request('PUT', url, { form }),
};
