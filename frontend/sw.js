// Mien service worker — hybrid caching + offline scan sync.
//
//  * Static shell (pages, css, js, icons) ... stale-while-revalidate
//  * AI models + face-api.js (/models, /vendor) ... cache-first (immutable)
//  * Dashboard data (GET /api/scans, /api/auth/me) ... network-first, short timeout, cache fallback
//  * Other /api calls ... never cached
//  * POST /api/scans while offline ... stored in IndexedDB, synced later
try { importScripts('/js/offline-queue.js'); } catch (_) {}

const V = 'v7';
const STATIC = 'mien-static-' + V;
const MODELS = 'mien-models-v1';
const API = 'mien-api-' + V;
const API_TIMEOUT_MS = 2000;
const SHELL = [
  '/', '/index.html', '/scan.html', '/history.html', '/dashboard.html', '/journal.html', '/login.html', '/signup.html',
  '/css/style.css', '/js/api.js', '/js/nav.js', '/js/theme.js', '/js/reference-data.js', '/js/results-render.js',
  '/js/vision-core.js', '/js/analyze.js', '/js/live-overlay.js', '/js/multi-face.js', '/js/share-card.js',
  '/js/charts.js', '/js/telemetry.js', '/js/offline-queue.js', '/manifest.webmanifest', '/icons/icon-192.png'
];
const CACHEABLE_API = ['/api/scans', '/api/auth/me'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, MODELS, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isModelAsset = (p) => p.startsWith('/models/') || p.startsWith('/vendor/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.method === 'POST' && url.pathname === '/api/scans') {
    e.respondWith(handleScanPost(req));
    return;
  }
  if (req.method !== 'GET') {
    // other writes (delete scan, login, ...) go straight to the network; drop stale cached data after them
    if (url.pathname.startsWith('/api/')) e.waitUntil(caches.delete(API));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API.includes(url.pathname)) e.respondWith(networkFirst(req, e));
    return; // admin & everything else: plain network
  }
  if (isModelAsset(url.pathname)) {
    e.respondWith(cacheFirst(req));
    return;
  }
  e.respondWith(staleWhileRevalidate(req, e));
});

// ---------- strategies ----------
async function cacheFirst(req) {
  const cache = await caches.open(MODELS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    e.waitUntil(net);
    return cached;
  }
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return (await cache.match('/index.html')) || Response.error();
  return Response.error();
}

function offlineJson() {
  return new Response(JSON.stringify({ error: 'You are offline.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Network first, but if the network has not answered within API_TIMEOUT_MS and
// a cached copy exists, answer from the cache (the fetch keeps running and
// refreshes the cache for next time).
async function networkFirst(req, e) {
  const cache = await caches.open(API);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  if (!cached) return net.catch(() => offlineJson());
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const t = setTimeout(() => finish(cached), API_TIMEOUT_MS);
    net.then((r) => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); finish(cached); });
  });
}

// ---------- offline scan queue ----------
async function handleScanPost(req) {
  const copy = req.clone();
  try {
    const res = await fetch(req);
    if (res.ok) caches.delete(API); // dashboard / history data is now stale
    return res;
  } catch (_) {
    // Network failure only (a server error response is returned as is above).
    let body;
    try { body = await copy.json(); } catch (_e) {
      return new Response(JSON.stringify({ error: 'Invalid scan data' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const userId = Number(copy.headers.get('X-Mien-User')) || null;
    const clientId = await OfflineQueue.enqueue(body, userId);
    try { await self.registration.sync.register(OfflineQueue.TAG); } catch (_e) { /* Background Sync unsupported: 'online' event / next page load flushes */ }
    return new Response(JSON.stringify({ queued: true, clientId }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

let notifying = false;
async function flushAndNotify() {
  const first = !notifying; // concurrent triggers share one flush; only the first announces it
  notifying = true;
  let summary;
  try {
    summary = await OfflineQueue.flush(); // throws on network failure -> sync retried
  } finally {
    notifying = false;
  }
  if (first && (summary.sent || summary.dropped)) {
    await caches.delete(API);
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'mien-sync', sent: summary.sent, left: summary.left }));
  }
  return summary;
}

self.addEventListener('sync', (e) => {
  if (e.tag === OfflineQueue.TAG) e.waitUntil(flushAndNotify());
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'flush') {
    e.waitUntil(flushAndNotify().catch(() => {}));
  } else if (d.type === 'clear-api-cache') {
    e.waitUntil(caches.delete(API));
  } else if (d.type === 'cache-urls' && Array.isArray(d.urls)) {
    // the page tells us which model files it just used so they are guaranteed offline
    e.waitUntil(
      caches.open(MODELS).then((c) =>
        Promise.all(
          d.urls
            .filter((u) => { try { const x = new URL(u); return x.origin === location.origin && isModelAsset(x.pathname); } catch (_) { return false; } })
            .map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {})))
        )
      )
    );
  }
});
