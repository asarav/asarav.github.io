import fs from 'node:fs';
import path from 'node:path';

export const prerender = true;

const PAGES_DIR = path.join(process.cwd(), 'src/pages');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Routes that actually exist as pages, never a hardcoded wish list. */
function routes(): string[] {
  const found: string[] = [];

  const walk = (dir: string, base = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, rel), rel);
        continue;
      }
      if (!rel.endsWith('.astro')) continue;
      if (rel === '404.astro') continue;
      // A page can opt out of the install-time shell when it is too large to
      // be worth fetching on every first visit; the fetch handler still caches
      // it the first time someone opens it.
      if (/export const precache = false;/.test(fs.readFileSync(path.join(dir, rel), 'utf8'))) continue;
      const route =
        rel === 'index.astro'
          ? '/'
          : rel.endsWith('/index.astro')
            ? `/${rel.slice(0, -'/index.astro'.length)}/`
            : `/${rel.replace(/\.astro$/, '')}/`;
      if (!found.includes(route)) found.push(route);
    }
  };

  walk(PAGES_DIR);
  return found.sort();
}

/** Fixed-name shell assets, included only when the build really produced them. */
function shellAssets(): string[] {
  const candidates = [
    '/assets/css/main.css',
    '/assets/js/site-motion.js',
    '/assets/js/media-fallback.js',
    '/projects.json',
    '/llms.txt'
  ];
  return candidates.filter((url) => fs.existsSync(path.join(PUBLIC_DIR, url)));
}

function cacheName(): string {
  // 14-digit build stamp, same shape the Jekyll version used.
  return `asarav-shell-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

export function GET() {
  const shell = [...routes(), ...shellAssets()];
  const body = `// Generated at build time from the pages and assets that exist.
// CACHE_NAME carries the build timestamp, so every deploy writes a new cache
// and activate() drops the previous one. The worker does NOT skipWaiting: the
// fresh worker waits until the last tab closes, then takes over and purges.
// That keeps caches rolling without reloading a page mid-session, and it is
// safe because the fetch handler is network-first.
const CACHE_NAME = '${cacheName()}';
const SHELL_ASSETS = ${JSON.stringify(shell, null, 2)};

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // One URL at a time: cache.addAll() rejects on the first failure and
      // leaves the cache partially populated, which is the state that breaks
      // the offline shell without saying so.
      return Promise.all(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function () {
            // Offline during install; scripts/check-sw-shell.mjs is what
            // catches a path that is genuinely absent from the build.
          });
        })
      );
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key.indexOf('asarav-shell-') === 0 && key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  // Skip media and fonts; let the browser handle them directly.
  if (/\\.(mp4|webm|mp3|wav|ogg|jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isFreshAsset = /\\.(css|js|json|txt|xml)$/i.test(url.pathname);

  if (!isNavigation && !isFreshAsset) {
    return;
  }

  // Network-first so updated markup and assets reach the visitor. The cache
  // is only a fallback for offline use.
  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        const clone = response.clone();
        const write = caches.open(CACHE_NAME).then(function (cache) {
          return cache.put(event.request, clone);
        });
        event.waitUntil(write);
      }
      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        if (cached) {
          return cached;
        }
        if (isNavigation) {
          return caches.match('/');
        }
        return undefined;
      });
    })
  );
});
`;

  return new Response(body, {
    headers: { 'content-type': 'application/javascript; charset=utf-8' }
  });
}
