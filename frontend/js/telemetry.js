// Performance & resource telemetry (for benchmarking / research write-ups).
// Everything stays on this device (localStorage) — nothing is sent anywhere.
// One row per scan: model init time, inference latency, JS heap, TF.js memory.
// Export from the dashboard's hidden developer panel (triple-click the
// "Insights" heading, or open /dashboard.html?dev=1).
(function (root) {
  'use strict';
  const KEY = 'mien.telemetry.v1';
  const MAX_ROWS = 1000;

  const COLUMNS = [
    'ts', 'source', 'faces', 'model_source', 'model_init_ms', 'inference_ms', 'total_ms',
    'heap_used_mb', 'heap_total_mb', 'heap_limit_mb', 'tf_bytes_mb', 'tf_tensors',
    'yaw', 'pitch', 'roll', 'dominant', 'error', 'user_agent'
  ];

  const session = { modelInitMs: null, modelSource: null, reported: false };

  function read() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function write(rows) {
    try {
      localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
    } catch (_) {}
  }

  const r1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  const mb = (b) => (typeof b === 'number' ? r1(b / 1048576) : null);

  // performance.memory exists only in Chromium; unavailable values are logged as empty.
  function memorySnapshot() {
    const o = { heap_used_mb: null, heap_total_mb: null, heap_limit_mb: null, tf_bytes_mb: null, tf_tensors: null };
    try {
      const pm = performance.memory;
      if (pm) {
        o.heap_used_mb = mb(pm.usedJSHeapSize);
        o.heap_total_mb = mb(pm.totalJSHeapSize);
        o.heap_limit_mb = mb(pm.jsHeapSizeLimit);
      }
    } catch (_) {}
    try {
      if (typeof faceapi !== 'undefined' && faceapi.tf && faceapi.tf.memory) {
        const m = faceapi.tf.memory();
        o.tf_bytes_mb = mb(m.numBytes);
        o.tf_tensors = m.numTensors;
      }
    } catch (_) {}
    return o;
  }

  function noteModelInit(ms, source) {
    session.modelInitMs = r1(ms);
    session.modelSource = source || null;
    session.reported = false;
  }

  // e: { source, faces, inferenceMs, totalMs, pose, dominant, error }
  function record(e) {
    e = e || {};
    const row = Object.assign(
      {
        ts: new Date().toISOString(),
        source: e.source || null,
        faces: e.faces != null ? e.faces : null,
        model_source: session.modelSource,
        model_init_ms: session.reported ? null : session.modelInitMs, // first scan after load only
        inference_ms: r1(e.inferenceMs),
        total_ms: r1(e.totalMs),
        yaw: r1(e.pose && e.pose.yaw),
        pitch: r1(e.pose && e.pose.pitch),
        roll: r1(e.pose && e.pose.roll),
        dominant: e.dominant || null,
        error: e.error || null,
        user_agent: navigator.userAgent
      },
      memorySnapshot()
    );
    if (session.modelInitMs != null) session.reported = true;
    const rows = read();
    rows.push(row);
    write(rows);
    return row;
  }

  function stats() {
    const rows = read();
    const nums = (k) => rows.map((r) => r[k]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null);
    const inf = nums('inference_ms');
    const heap = nums('heap_used_mb');
    return {
      n: rows.length,
      inferenceMean: r1(mean(inf)),
      inferenceMedian: r1(pct(inf, 50)),
      inferenceP95: r1(pct(inf, 95)),
      heapMean: r1(mean(heap)),
      heapMax: r1(heap.length ? heap[heap.length - 1] : null),
      initMean: r1(mean(nums('model_init_ms')))
    };
  }

  function toCSV() {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [COLUMNS.join(',')];
    read().forEach((r) => lines.push(COLUMNS.map((c) => esc(r[c])).join(',')));
    return lines.join('\r\n');
  }

  function download() {
    const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mien-telemetry-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  root.MienTelemetry = { record, all: read, clear, toCSV, download, stats, noteModelInit, COLUMNS };
})(window);
