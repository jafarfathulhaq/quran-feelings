'use strict';

// Only cache icons & manifest — things that NEVER change.
// app.js, style.css, and HTML are always fetched fresh from the network
// so every deploy is instantly visible with zero manual cache busting.
const CACHE_NAME    = 'temuquran-static-v2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ── Install: pre-cache only truly static assets ───────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clear all old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Push: show notification ────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  if (!event.data) return;

  const payload = event.data.json();

  const options = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-badge-96.png',
    data: { url: payload.data?.url || '/' },
    actions: payload.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ── Notification click: open or focus app ──────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Fetch: routing strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── Network-only: all API calls (never cache) ─────────────────────────────
  if (url.pathname.startsWith('/api/')) return;

  // ── Network-only: HTML, JS, CSS — always fresh, updates deploy instantly ──
  const ext = url.pathname.split('.').pop();
  if (['html', 'js', 'css'].includes(ext) || url.pathname === '/' || url.pathname === '') return;

  // ── Cache-first: icons, fonts, manifest (rarely/never change) ─────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(networkRes => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkRes;
      });
    })
  );
});
