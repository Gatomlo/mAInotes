// Service worker : reseau d'abord (3 s), sinon copie gardee ; API jamais mise en cache.
// Portee = dossier de l'app. Changer VERSION quand la liste FILES change.
const VERSION = '__SLUG__-v1';
const FILES = ['./', 'style.css', 'manifest.json', 'icon.svg', 'app/main.js', 'app/api.js', 'app/ui.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const key = req.mode === 'navigate' ? new URL(self.registration.scope).pathname : req;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('lent')), 3000))]);
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch {
      return (await cache.match(key, { ignoreSearch: true })) || fetch(req);
    }
  })());
});
