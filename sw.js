/* NerdyTradeIntuition service worker — offline-first app shell */
const VERSION = 'nti-v2-10';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest',
  'quotes.js', 'fno.js', 'core.js', 'data.js', 'chart.js', 'draw.js', 'draw2.js', 'packs.js', 'risk.js', 'stats.js', 'dash.js', 'watch.js', 'settings.js', 'app.js', 'pwa.js',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
    return hit || net; // cache-first, refresh in background
  }));
});
