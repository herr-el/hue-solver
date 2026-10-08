// Network first, cache only as offline fallback, so a deploy never serves stale JS.
// Paths are relative to the SW scope, so the app also works in a subfolder (e.g. GitHub Pages).
const CACHE = 'huesolver-v4';
const SHELL = ['./', 'index.html', 'css/tokens.css', 'css/app.css', 'js/app.js', 'js/worker.js', 'js/segment.js', 'js/solve.js', 'js/i18n.js', 'manifest.json', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('huesolver-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
