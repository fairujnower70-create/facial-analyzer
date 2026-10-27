// Dashboard charts (inline SVG, no libraries). Display only — reads the scans
// the dashboard already loaded.
function renderCharts(scans) {
  renderEmotionDonut(document.getElementById('chart-emotions'), scans);
  renderSymmetryTrend(document.getElementById('chart-trend'), scans);
}

function renderEmotionDonut(el, scans) {
  if (!el) return;
  const counts = {};
  scans.forEach((s) => {
    if (s.dominant_expression) counts[s.dominant_expression] = (counts[s.dominant_expression] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (!total) {
    el.innerHTML = '<p class="muted chart-empty">Save a scan to see your emotion mix.</p>';
    return;
  }

  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = entries
    .map(([name, c], i) => {
      const len = (c / total) * C;
      const seg = `<circle class="donut-seg" cx="70" cy="70" r="${R}" fill="none" stroke="${emotionColor(name)}" stroke-width="16"
        stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"
        style="animation-delay:${i * 120}ms"><title>${capWord(name)}: ${c}</title></circle>`;
      offset += len;
      return seg;
    })
    .join('');

  const legend = entries
    .map(
      ([name, c]) => `<li><span class="dot" style="background:${emotionColor(name)}"></span>${capWord(name)}<b>${Math.round((c / total) * 100)}%</b></li>`
    )
    .join('');

  el.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Emotion mix">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--bg-input)" stroke-width="16"/>
        ${segs}
        <text x="70" y="68" text-anchor="middle" class="donut-num">${total}</text>
        <text x="70" y="86" text-anchor="middle" class="donut-lbl">scans</text>
      </svg>
      <ul class="chart-legend">${legend}</ul>
    </div>`;
}

function renderSymmetryTrend(el, scans) {
  if (!el) return;
  const pts = scans
    .filter((s) => s.symmetry_score != null)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-12);
  if (pts.length < 2) {
    el.innerHTML = '<p class="muted chart-empty">Save at least two scans to see your trend.</p>';
    return;
  }

  const W = 300, H = 140, padX = 14, padT = 14, padB = 22;
  const vals = pts.map((p) => p.symmetry_score);
  const lo = Math.max(0, Math.min(...vals) - 8), hi = Math.min(100, Math.max(...vals) + 8);
  const x = (i) => padX + (i / (pts.length - 1)) * (W - padX * 2);
  const y = (v) => padT + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - padT - padB);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.symmetry_score).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const dots = pts
    .map(
      (p, i) => `<circle class="trend-dot" cx="${x(i).toFixed(1)}" cy="${y(p.symmetry_score).toFixed(1)}" r="3.6" style="animation-delay:${400 + i * 60}ms"><title>${Math.round(p.symmetry_score)}/100 · ${new Date(p.created_at).toLocaleDateString()}</title></circle>`
    )
    .join('');

  const last = Math.round(vals[vals.length - 1]);
  const diff = Math.round(vals[vals.length - 1] - vals[0]);
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Symmetry over time" class="trend-svg">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".38"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient>
        <linearGradient id="tl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
      </defs>
      <line x1="${padX}" x2="${W - padX}" y1="${H - padB}" y2="${H - padB}" stroke="var(--border)"/>
      <path d="${area}" fill="url(#tg)" class="trend-area"/>
      <path d="${line}" fill="none" stroke="url(#tl)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="trend-line"/>
      ${dots}
    </svg>
    <p class="chart-note">Latest <b>${last}/100</b> · ${diff >= 0 ? '+' : ''}${diff} since first of these ${pts.length}</p>`;
}

// ---------- hidden developer panel (telemetry export for research) ----------
// Open with /dashboard.html?dev=1, or triple-click the "Insights" heading.
(function () {
  function show() {
    if (document.getElementById('dev-panel') || typeof MienTelemetry === 'undefined') return;
    const st = MienTelemetry.stats();
    const f = (v, u) => (v == null ? '—' : v + (u || ''));
    const panel = document.createElement('section');
    panel.id = 'dev-panel';
    panel.className = 'dev-panel';
    panel.innerHTML = `
      <h3>Developer telemetry</h3>
      <div class="dev-stats">
        <div><b>${st.n}</b>scans logged</div>
        <div><b>${f(st.initMean, ' ms')}</b>model init (avg)</div>
        <div><b>${f(st.inferenceMedian, ' ms')}</b>inference median</div>
        <div><b>${f(st.inferenceP95, ' ms')}</b>inference p95</div>
        <div><b>${f(st.heapMean, ' MB')}</b>JS heap (avg)</div>
        <div><b>${f(st.heapMax, ' MB')}</b>JS heap (max)</div>
      </div>
      <button class="btn btn-primary" id="dev-export">Export CSV</button>
      <button class="btn btn-ghost" id="dev-clear">Clear log</button>
      <p class="field-hint" style="margin-top:10px;">Stored only on this device. Heap figures need a Chromium browser.</p>`;
    const anchor = document.getElementById('chart-emotions');
    const section = anchor ? anchor.closest('section') : null;
    const host = (section && section.parentElement && section.parentElement.parentElement) || document.querySelector('main');
    host.insertBefore(panel, host.firstChild);
    document.getElementById('dev-export').onclick = () => MienTelemetry.download();
    document.getElementById('dev-clear').onclick = () => {
      if (confirm('Delete all telemetry rows on this device?')) { MienTelemetry.clear(); panel.remove(); show(); }
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (/[?&]dev=1/.test(location.search)) show();
    document.querySelectorAll('h2').forEach((h) => {
      if (h.textContent.trim() === 'Insights') h.addEventListener('click', (e) => { if (e.detail === 3) show(); });
    });
  });
})();
