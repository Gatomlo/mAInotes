// Service worker : l'interface s'ouvre sans réseau. L'API n'est jamais mise en cache,
// sauf les médias déjà consultés (lecture hors connexion).
const VERSION = 'mainotes-v9';
// Réseau lent ou muet (signal faible) : passé ce délai, on ouvre la copie locale.
const NET_TIMEOUT = 3000;
// Après un délai dépassé, les fichiers suivants partent aussitôt de la copie locale pendant 30 s.
let slowUntil = 0;
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
  // Réseau d'abord pour l'interface (mises à jour immédiates), copie locale si le réseau
  // échoue, répond une erreur serveur ou tarde. La réponse tardive met quand même la copie à jour.
  const net = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  });
  const local = () => caches.match(req).then((hit) => hit || (req.mode === 'navigate'
    ? caches.match(req, { ignoreSearch: true }).then((h) => h || caches.match('index.html'))
    : undefined));
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const fallback = (res) => local().then((hit) => {
      if (done) return;
      if (hit) { done = true; resolve(hit); } else if (res) { done = true; resolve(res); }
    });
    const timer = setTimeout(() => { slowUntil = Date.now() + 30000; fallback(null); }, Date.now() < slowUntil ? 0 : NET_TIMEOUT);
    net.then((res) => {
      clearTimeout(timer);
      slowUntil = 0;
      if (res.status >= 500) return fallback(res);
      if (!done) { done = true; resolve(res); }
    }, () => {
      clearTimeout(timer);
      fallback(null).then(() => { if (!done) { done = true; resolve(Response.error()); } });
    });
  }));
});
