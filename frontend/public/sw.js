/**
 * Service Worker for Installment Management System 6
 * Provides robust application shell caching, offline navigation fallback,
 * resilient static asset caching, and background synchronization triggers.
 */

const CACHE_NAME = 'ims-static-v3';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

/**
 * Safely writes a response to the cache with strict protocol validation,
 * dual keying (Request and pathname), and error suppression.
 */
async function safeCachePut(cacheName, request, response) {
  try {
    if (!request || !response) return;
    if (request.method && request.method !== 'GET') return;

    let url;
    try {
      url = typeof request === 'string' ? new URL(request, self.location.origin) : new URL(request.url);
    } catch {
      return;
    }

    // Only cache http: and https: schemes (Cache API rejects chrome-extension:, data:, blob:, etc.)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }

    // Never cache API requests in Service Worker (structured data handled by IndexedDB)
    if (url.pathname.startsWith('/api/')) {
      return;
    }

    // Only cache successful 200 OK responses
    if (response.status !== 200 || response.type === 'error') {
      return;
    }

    const cache = await caches.open(cacheName);
    // Put under both the request/URL and the clean pathname for maximum lookup resilience
    await cache.put(request, response.clone());
    if (url.pathname && url.pathname !== url.href) {
      await cache.put(url.pathname, response.clone());
    }
  } catch (err) {
    // Fail safely: A cache write failure must never crash or break fetch execution
  }
}

// Install: Pre-cache application shell and dynamically discovered Vite bundles
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. Cache known base static assets safely with Origin headers
      for (const asset of PRECACHE_ASSETS) {
        try {
          const fullUrl = new URL(asset, self.location.origin).href;
          const req = new Request(fullUrl, {
            credentials: 'same-origin',
            headers: { Origin: self.location.origin },
          });
          const response = await fetch(req);
          if (response && response.status === 200) {
            await cache.put(req, response.clone());
            await cache.put(asset, response.clone());
            await cache.put(fullUrl, response);
          }
        } catch (err) {
          // Precache asset skip (non-fatal)
        }
      }

      // 2. Dynamically discover and cache any JS/CSS assets linked in index.html
      try {
        const indexResponse =
          (await cache.match('/index.html', { ignoreVary: true })) ||
          (await fetch('/index.html', { cache: 'no-cache' }));

        if (indexResponse && indexResponse.status === 200) {
          const htmlText = await indexResponse.clone().text();
          const scriptMatches = [...htmlText.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
          const linkMatches = [...htmlText.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]);
          const discovered = [...scriptMatches, ...linkMatches].filter(
            (u) => u && !u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('//')
          );

          for (const assetUrl of discovered) {
            try {
              const fullUrl = new URL(assetUrl, self.location.origin).href;
              const req = new Request(fullUrl, {
                credentials: 'same-origin',
                headers: { Origin: self.location.origin },
              });
              const res = await fetch(req);
              if (res && res.status === 200) {
                await cache.put(req, res.clone());
                await cache.put(assetUrl, res.clone());
                await cache.put(fullUrl, res);
              }
            } catch (err) {
              // Non-fatal
            }
          }
        }
      } catch (discoveryErr) {
        // Non-fatal dynamic discovery failure
      }
    })()
  );
  // Activate immediately so new assets are available to all tabs
  self.skipWaiting();
});

// Activate: Clean up obsolete caches and claim clients
// Retains the current cache and the previous cache version (last 2 versions)
// so open tabs and older clients are not disrupted by premature cache deletion.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const imsCaches = keys
        .filter((key) => key.startsWith('ims-static-'))
        .sort(); // Chronological order by version timestamp

      // Keep the 2 most recent cache versions (active and immediately preceding)
      if (imsCaches.length > 2) {
        const cachesToDelete = imsCaches.slice(0, imsCaches.length - 2);
        await Promise.all(
          cachesToDelete.map((oldKey) => {
            console.log('[SW] Purging deprecated cache version:', oldKey);
            return caches.delete(oldKey);
          })
        );
      }
      await self.clients.claim();
    })()
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

  // 5. Navigation requests (HTML document) — Network first with immediate SPA fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // If explicitly offline, immediately return cached index.html without network delay
        if (!navigator.onLine) {
          const cachedIndex =
            (await caches.match('/index.html', { ignoreVary: true })) ||
            (await caches.match('/', { ignoreVary: true }));
          if (cachedIndex) return cachedIndex;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            safeCachePut(CACHE_NAME, request, networkResponse);
          }
          return networkResponse;
        } catch (networkErr) {
          // Network failed or offline: return cached SPA index.html so React Router takes over
          const cachedIndex =
            (await caches.match('/index.html', { ignoreVary: true })) ||
            (await caches.match('/', { ignoreVary: true }));
          if (cachedIndex) return cachedIndex;

          const cachedOffline = await caches.match('/offline.html', { ignoreVary: true });
          if (cachedOffline) return cachedOffline;

          return new Response('Offline mode unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        }
      })()
    );
    return;
  }

  // 6. Static Assets (JS, CSS, SVGs, Images, Fonts, /assets/) — Strict Cache-First Strategy
  const isScript = request.destination === 'script' || url.pathname.endsWith('.js');
  const isStyle = request.destination === 'style' || url.pathname.endsWith('.css');
  const isStaticAsset =
    isScript ||
    isStyle ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf');

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        // 6a. Exact Cache Match: Zero-latency Cache-First retrieval of genuine asset
        // Uses ignoreVary: true to prevent Vary: Origin cache misses on CORS script tags
        const cachedResponse =
          (await caches.match(request, { ignoreVary: true })) ||
          (await caches.match(url.pathname, { ignoreVary: true })) ||
          (await caches.match(url.href, { ignoreVary: true }));

        if (cachedResponse) {
          // In background, revalidate from network when online to keep assets fresh
          if (navigator.onLine) {
            fetch(request)
              .then((netRes) => {
                if (netRes && netRes.status === 200) {
                  safeCachePut(CACHE_NAME, request, netRes);
                }
              })
              .catch(() => {});
          }
          return cachedResponse;
        }

        // 6b. Not in cache yet: if online, fetch from network and cache
        if (navigator.onLine) {
          try {
            const netRes = await fetch(request);
            if (netRes && netRes.status === 200) {
              safeCachePut(CACHE_NAME, request, netRes);
            }
            return netRes;
          } catch (netErr) {
            // Network failed, proceed to explicit error
          }
        }

        // 6c. Explicit Error Reporting:
        // Do NOT return fake 200 responses with empty comments.
        // Do NOT serve random mismatched chunks from other builds.
        // If an asset is genuinely unavailable offline, report an honest explicit error.
        return new Response('Asset not available in offline cache', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain',
            'X-SW-Error': 'AssetUnavailableOffline',
          }),
        });
      })()
    );
    return;
  }

  // 7. Default for other same-origin requests: Cache first if offline, else network-first
  event.respondWith(
    (async () => {
      const cached =
        (await caches.match(request, { ignoreVary: true })) ||
        (await caches.match(url.pathname, { ignoreVary: true }));

      if (!navigator.onLine && cached) {
        return cached;
      }
      try {
        const netRes = await fetch(request);
        if (netRes && netRes.status === 200) {
          safeCachePut(CACHE_NAME, request, netRes);
        }
        return netRes;
      } catch (err) {
        if (cached) return cached;
        return new Response('Resource unavailable offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        });
      }
    })()
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
