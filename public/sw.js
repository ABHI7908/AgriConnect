// Minimal service worker: lets the app install and keeps the shell (CSS/JS/fonts/icons) fast and available offline.
// API calls, uploads and the background video are never cached.
const VERSION = 'v20';
const CACHE = `agri-shell-${VERSION}`;
const SHELL = [
  '/', '/login', '/calculator', '/farmer', '/owner', '/chats', '/admin', '/database-manager',
  '/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
  '/css/style.css', '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js',
  '/js/index.js', '/js/login.js', '/js/calculator.js', '/js/farmer.js', '/js/owner.js', '/js/chats.js',
  '/js/admin.js', '/js/database-manager.js',
  '/js/lib/api.js', '/js/lib/backdrop.js', '/js/lib/bookings-ui.js', '/js/lib/dom.js',
  '/js/lib/geo.js', '/js/lib/listing-ui.js', '/js/lib/map.js', '/js/lib/navigation.js', '/js/lib/notifications.js', '/js/lib/preferences.js', '/js/lib/session.js', '/js/lib/tabs.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/media/')) return;

  // Pages and scripts: network first so updates show up, cache as fallback when offline.
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if (fresh) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
    return;
  }
  // Fonts, icons, images: cache first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
