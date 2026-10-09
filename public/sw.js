// Service worker : l'interface s'ouvre sans réseau. L'API n'est jamais mise en cache,
// sauf les médias déjà consultés (lecture hors connexion).
const VERSION = 'mainotes-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.json', 'manifest-new.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/new-192.png',
  'js/core.js', 'js/auth.js', 'js/views.js', 'js/modals.js', 'js/settings.js', 'js/events.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith('api/')) {
    if (rel.startsWith('api/media/')) {
      e.respondWith(caches.open(VERSION + '-media').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    }
    return;
  }
  // Réseau d'abord pour l'interface (mises à jour immédiates), cache si hors ligne.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(req, { ignoreSearch: true }).then((h) => h || caches.match('index.html')) : Response.error()))));
});
