/* CoffeeKo app helper (service worker).
   - Pages, code and styles: always try the network first, so updates show at once;
     fall back to the saved copy when offline.
   - Story photos and icons: saved copy first (they rarely change).
   - Never stores logins, the database, AI calls or roasters' shops. */
const V = 'ck-v1';
const SHELL = ['/', '/index.html', '/css/style.css', '/css/auth.css', '/config/theme.css', '/config/content.js', '/config/settings.js', '/js/story.js', '/js/data.js', '/js/app.js', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/')) return;   // database, AI, shops: straight to network
  if (/^\/(photos|icons)\//.test(u.pathname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })));
    return;
  }
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
