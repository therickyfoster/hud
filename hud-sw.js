// Cache HUD assets for snappy loads
const NAME = 'pra-hud-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(NAME).then(c=>c.addAll([
    '/hud/hud-loader.js',
    '/hud/hud-manifest.json',
    '/hud/modules/log.html'
  ])));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (!request.url.includes('/hud/')) return;
  e.respondWith(
    caches.match(request).then(res => res || fetch(request).then(net => {
      const copy = net.clone();
      caches.open(NAME).then(c => c.put(request, copy));
      return net;
    }))
  );
});