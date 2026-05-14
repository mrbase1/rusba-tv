const CACHE_NAME = 'rusbatv-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install: Cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy for different types of requests
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (except logos/posters handled by img tags)
  // or non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For app assets (JS, CSS, images from same origin)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          // Cache Vite assets (have hash in name)
          if (url.pathname.startsWith('/assets/')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback if network fails and not in cache
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return null;
        });
      })
    );
  }
});
