// IndexedDB queue for scans saved while offline. Shared by the pages and the
// service worker (sw.js loads it with importScripts), so both see one queue.
// Entries are plain scan payloads (including the small thumbnail). They are
// stored unencrypted in this browser's own origin storage.
(function (root) {
  'use strict';
  const DB_NAME = 'mien-offline';
  const STORE = 'scan-queue';
  const TAG = 'mien-sync-scans';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : undefined); };
      t.onerror = () => { db.close(); reject(t.error); };
      t.onabort = () => { db.close(); reject(t.error); };
    });
  }

  const add = (entry) => tx('readwrite', (s) => s.add(entry));
  const all = () => tx('readonly', (s) => s.getAll());
  const remove = (id) => tx('readwrite', (s) => s.delete(id));
  const count = () => tx('readonly', (s) => s.count());

  function uuid() {
    try { if (root.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Queue one scan body. userId lets a different account on the same device
  // avoid uploading someone else's scans.
  async function enqueue(body, userId) {
    const b = Object.assign({}, body);
    if (!b.clientId) b.clientId = uuid();
    if (!b.capturedAt) b.capturedAt = new Date().toISOString();
    await add({ userId: userId || null, body: b, queuedAt: Date.now() });
    return b.clientId;
  }

  let flushing = null;
  // Sends queued scans to POST /api/scans. Throws on a network failure (so a
  // Background Sync event is retried by the browser); returns a summary otherwise.
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      const items = await all();
      const summary = { sent: 0, dropped: 0, left: items.length, signedIn: true };
      if (!items.length) return summary;

      const meRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }); // network error -> throws
      if (meRes.status === 401) { summary.signedIn = false; return summary; }
      if (!meRes.ok) throw new Error('server not ready');
      const me = (await meRes.json()).user;

      for (const item of items) {
        if (item.userId && me && item.userId !== me.id) continue; // belongs to another account
        const res = await fetch('/api/scans', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body)
        }); // network error -> throws, loop stops, retried later
        if (res.ok) {
          await remove(item.id);
          summary.sent++;
        } else if (res.status >= 400 && res.status < 500 && ![401, 403, 408, 429].includes(res.status)) {
          await remove(item.id); // the server will never accept this payload
          summary.dropped++;
        } else {
          throw new Error('server returned ' + res.status); // keep it, retry later
        }
      }
      summary.left = await count();
      return summary;
    })().finally(() => { flushing = null; });
    return flushing;
  }

  root.OfflineQueue = { TAG, add, all, remove, count, enqueue, flush, uuid };
})(typeof self !== 'undefined' ? self : window);
