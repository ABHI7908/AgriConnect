import { api } from './api.js';
import { esc } from './dom.js';
import { setupApp } from './backdrop.js';
import { initNavigation } from './navigation.js';
import { initNotificationCenter } from './notifications.js';
import { initPreferences } from './preferences.js';

let userPromise;
let metaPromise;

export function getUser() {
  if (!userPromise) {
    userPromise = api.get('/auth/me').then((r) => r.user).catch(() => null);
  }
  return userPromise;
}
export function resetUser() { userPromise = undefined; }

export function getMeta() {
  if (!metaPromise) metaPromise = api.get('/meta');
  return metaPromise;
}

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 9 L17 4 L28 11 L25 26 L8 28 Z" fill="#f2a900" stroke="#143d27" stroke-width="2" stroke-linejoin="round"/><g fill="#143d27"><rect x="2" y="7" width="5" height="5"/><rect x="15" y="2" width="5" height="5"/><rect x="26" y="9" width="5" height="5"/><rect x="23" y="24" width="5" height="5"/><rect x="6" y="26" width="5" height="5"/></g></svg>`;

const homeFor = (role) => ({ farmer: '/farmer', owner: '/owner', admin: '/admin' }[role] || '/login');

/** Render the site header into <header id="site-header">. */
export function renderHeader(user, { showMenu = true } = {}) {
  setupApp();
  const host = document.getElementById('site-header');
  if (!host) return;

  let menu = '';
  if (showMenu) {
    let items = '';
    if (!user) items = `<a class="btn small nav-account-link" href="/login"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg><span>Log in / Sign up</span></a>`;
    if (user) {
      const identity = `<span class="who">${esc(user.name || user.phone || user.email || '')}</span>`;
      if (user.role === 'farmer') {
        items = identity +
          `<a href="/farmer#bookings">My farm dashboard</a>` +
          `<a href="/farmer?bookings=active#bookings">Active bookings</a>` +
          `<a href="/farmer?bookings=history#bookings">Past bookings</a>` +
          `<a href="/chats">Chats</a>` +
          `<a href="/farmer#saved">Saved calculations</a>` +
          `<a href="/calculator">Land &amp; yield calculator</a>` +
          `<a href="/farmer#profile">My profile</a>` +
          `<button class="link" type="button" data-logout>Sign out</button>`;
      } else if (user.role === 'owner') {
        items = identity +
          `<a href="/owner#requests">My business dashboard</a>` +
          `<a href="/owner?bookings=active#requests">Active bookings</a>` +
          `<a href="/owner?bookings=history#requests">Past bookings</a>` +
          `<a href="/chats">Chats</a>` +
          `<a href="/owner#machines">My machines</a>` +
          `<a href="/owner#labour">Labour teams</a>` +
          `<a href="/owner#customers">Customers served</a>` +
          `<a href="/calculator">Land &amp; yield calculator</a>` +
          `<a href="/owner#profile">My profile</a>` +
          `<button class="link" type="button" data-logout>Sign out</button>`;
      } else {
        items = identity + `<button class="link" type="button" data-logout>Sign out</button>`;
      }
    }
    menu = `<button class="nav-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="main-navigation"><span class="nav-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span><span>Menu</span></button><nav class="nav" id="main-navigation" aria-label="Main">${items}</nav>`;
  }

  host.className = 'site-header';
  host.innerHTML = `<div class="container"><a class="brand" href="/">${LOGO}<span>AgriConnect</span></a><div class="header-preferences"></div><div class="header-alerts"></div>${menu}</div>`;
  if (user && (user.role === 'farmer' || user.role === 'owner')) {
    initNotificationCenter(host.querySelector('.header-alerts'), user.role);
  }
  if (showMenu) {
    initNavigation(host);
    initPreferences(host.querySelector('.header-preferences'));
  } else {
    initPreferences(host.querySelector('.header-preferences'), { language: false, theme: true });
  }
  host.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try { await api.post('/auth/logout'); } finally { resetUser(); location.href = '/login'; }
  });
}

export function renderFooter() {
  const host = document.getElementById('site-footer');
  if (!host) return;
  host.className = 'site-footer';
  host.innerHTML = `<div class="container"><span>AgriConnect: machinery, drones and farm labour near your field.</span><span><a href="/login?role=owner">List your machines</a> &nbsp; <a href="/admin">Admin</a></span></div>`;
}

/** Page bootstrap: header + footer, returns the current user (or null). */
export async function initPage(_active, { requireUser = false } = {}) {
  const user = await getUser();
  if (!user && requireUser) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`/login?role=farmer&next=${next}`);
    return new Promise(() => {});
  }
  renderHeader(user);
  renderFooter();
  return user;
}

/** Guard for role-only pages. Redirects to login (remembering where to come back to). */
export async function requireRole(role, _active) {
  const user = await getUser();
  if (!user || user.role !== role) {
    const next = encodeURIComponent(location.pathname + location.search);
    if (role === 'admin') { /* admin page renders its own login form */ renderHeader(user && user.role === 'admin' ? user : null, { showMenu: false }); renderFooter(); return null; }
    location.replace(`/login?role=${role}&next=${next}`);
    return new Promise(() => {}); // never resolves; page is navigating away
  }
  renderHeader(user, { showMenu: role !== 'admin' });
  renderFooter();
  return user;
}

export { homeFor };
