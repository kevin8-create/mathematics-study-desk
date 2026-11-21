const scope = self.registration.scope;
const cachePrefix = `mathematics-study-desk:${scope}`;
const cacheName = `${cachePrefix}:1`;
const shellFiles = [
  './', './index.html', './app.css', './app.js', './bank.json',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/katex/katex.min.css', './vendor/katex/katex.min.js'
];
const shellPaths = new Set(shellFiles.map(file => new URL(file, scope).pathname));
const fontsPath = new URL('./vendor/katex/fonts/', scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shellFiles);
    const stylesheet = new URL('./vendor/katex/katex.min.css', scope);
    const response = await cache.match(stylesheet);
    const css = await response.text();
    const fonts = new Set(Array.from(css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g),
      match => new URL(match[1], stylesheet).href));
    await cache.addAll([...fonts]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(`${cachePrefix}:`) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  if (!shellPaths.has(url.pathname) && !url.pathname.startsWith(fontsPath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        return response;
      }
      return (await cache.match(request, { ignoreSearch: true })) || response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
