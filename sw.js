'use strict';

const CACHE_NAME    = 'ayat-v3';
const STATIC_ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ── Install: pre-cache all static assets ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: clear stale caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  // Take control of existing clients immediately
  self.clients.claim();
});

// ── Fetch: routing strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests over HTTP(S)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── Network-only: AI / analytics API endpoints (never cache) ────────────────
  if (
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/verse-of-day'
  ) {
    return; // fall through to browser default (network)
  }

  // ── Network-first: Verse of the Day (fresh daily, but offline-safe) ─────────
  if (url.pathname === '/api/verse-of-day') {
    event.respondWith(
      fetch(event.request)
        .then(networkRes => {
          if (networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Cache-first: static assets (HTML, CSS, JS, icons, fonts) ────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(networkRes => {
        // Only cache successful same-origin or cross-origin GET responses
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkRes;
      });
    })
  );
});
