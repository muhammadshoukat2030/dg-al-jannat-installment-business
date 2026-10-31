/**
 * Service Worker for Installment Management System 6
 * Provides robust application shell caching, offline navigation fallback,
 * and background synchronization triggers.
 */

const CACHE_NAME = 'ims-static-v2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

/**
 * Safely writes a response to the cache with strict protocol validation
 * and error suppression so failures never break fetch execution.
 */
async function safeCachePut(cacheName, request, response) {
  try {
    if (!request || !response) return;
    if (request.method !== 'GET') return;

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return;
    }

    // Only cache http: and https: schemes (Cache API rejects chrome-extension:, etc.)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }

    // Only cache successful 200 OK responses
    if (response.status !== 200 || response.type === 'error') {
      return;
    }

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (err) {
    // Fail safely: A cache write failure must never crash or break the fetch event
  }
}

// Install: Pre-cache application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up obsolete caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Only process GET requests (Cache API only supports GET)
  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // 2. Ignore non-HTTP/HTTPS protocols (chrome-extension:, moz-extension:, data:, blob:, file:, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 3. Never intercept API requests with HTTP cache — structured data is managed by IndexedDB
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. Ignore cross-origin requests — application only caches same-origin app shell & assets
  if (url.origin !== self.location.origin) {
    return;
  }

  // 5. Navigation requests (HTML document) — Network first with SPA fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            safeCachePut(CACHE_NAME, request, response);
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback: return cached index.html so React Router takes over
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;

          const cachedOffline = await caches.match('/offline.html');
          if (cachedOffline) return cachedOffline;

          return new Response('Offline mode unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        })
    );
    return;
  }

  // 6. Static Assets (JS, CSS, SVGs, Images, Fonts) — Cache-first with stale-while-revalidate
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Background fetch to refresh cache
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                safeCachePut(CACHE_NAME, request, networkResponse);
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Fetch from network and cache
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              safeCachePut(CACHE_NAME, request, networkResponse);
            }
            return networkResponse;
          })
          .catch(async () => {
            const cached = await caches.match(request);
            if (cached) return cached;
            return new Response('', { status: 408, statusText: 'Request timed out or offline' });
          });
      })
    );
    return;
  }

  // 7. Default for other same-origin requests: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Background Sync Event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-operations') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
        });
      })
    );
  }
});
