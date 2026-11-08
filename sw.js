const CACHE_NAME = 'asarav-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/projects/',
  '/music/',
  '/games/',
  '/books/',
  '/about/',
  '/log/',
  '/contact/',
  '/assets/css/main.css',
  '/assets/js/site-motion.js',
  '/assets/js/media-fallback.js',
  '/projects.json',
  '/llms.txt'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_ASSETS).catch(function () {
        // Ignore individual failures (e.g., offline during install).
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  // Only cache same-origin GET requests.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }
  // Skip large media files.
  if (/\.(mp4|webm|mp3|wav|ogg|jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname)) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        // Offline fallback: return cached index if available.
        return caches.match('/');
      });
    })
  );
});