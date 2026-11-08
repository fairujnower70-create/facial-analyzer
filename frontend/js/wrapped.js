// Mien Wrapped: a Spotify-Wrapped-style summary of one period, built entirely
// from scans the person already saved. Shows a share card on screen (what you
// see is exactly what gets shared).
(async function () {
  try { await Api.me(); } catch (_) { window.location.href = '/login.html?next=dashboard'; return; }

  let scans = [];
  try { scans = ownScans((await Api.getScans()).scans); }
  catch (err) { document.getElementById('loading').innerHTML = `<p class="muted center">Could not load your scans: ${escapeHtml(err.message)}</p>`; return; }
  document.getElementById('loading').style.display = 'none';

  let firstName = '';
  try { firstName = (await Api.me()).user.name.split(' ')[0]; } catch (_) {}

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let period = 'month';
  let lastBlob = null;

  function range(p) {
    const now = new Date();
    if (p === 'week') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), title: 'Your week', sub: 'Last 7 days' };
    }
    if (p === 'last') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start, end: new Date(now.getFullYear(), now.getMonth(), 1), title: `Your ${MONTHS[start.getMonth()]}`, sub: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: new Date(now.getFullYear(), now.getMonth() + 1, 1), title: `Your ${MONTHS[now.getMonth()]}`, sub: `${MONTHS[now.getMonth()]} ${now.getFullYear()}` };
  }

  function compute(list) {
    const counts = {};
    list.forEach((s) => { if (s.dominant_expression) counts[s.dominant_expression] = (counts[s.dominant_expression] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    const byDay = {};
    list.forEach((s) => { (byDay[dayKey(new Date(s.created_at))] = byDay[dayKey(new Date(s.created_at))] || []).push(s); });
    const days = Object.keys(byDay).sort();

    // happiest day = highest average "happy" score
    let happiest = null;
    days.forEach((k) => {
      const v = byDay[k].map((s) => parseExpr(s).happy).filter((x) => typeof x === 'number');
      if (!v.length) return;
      const a = v.reduce((x, y) => x + y, 0) / v.length;
      if (!happiest || a > happiest.score) happiest = { day: k, score: a };
    });

    // longest streak inside the period
    let best = 0, run = 0, prev = null;
    days.forEach((k) => { const n = dayNumber(k); run = prev !== null && n - prev === 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; });

    // most surprised moment
    let surprised = null;
    list.forEach((s) => {
      const v = parseExpr(s).surprised;
      if (typeof v === 'number' && (!surprised || v > surprised.score)) surprised = { scan: s, score: v };
    });

    return { total: list.length, top: top ? { name: top[0], pct: Math.round((top[1] / list.length) * 100) } : null, happiest, streak: best, daysScanned: days.length, surprised };
  }

  function fmtDay(k) { const [y, m, d] = k.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${d}`; }

  async function drawCard(stats, r) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const color = stats.top ? emotionColor(stats.top.name) : '#8b5cf6';

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, 160, 20, W * 0.8, 160, 760);
    glow.addColorStop(0, color + '77'); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const ring = ctx.createLinearGradient(60, 60, 130, 130);
    ring.addColorStop(0, '#22d3ee'); ring.addColorStop(0.5, '#8b5cf6'); ring.addColorStop(1, '#ec4899');
    ctx.strokeStyle = ring; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(96, 96, 32, 0.3, Math.PI * 2 - 0.3); ctx.stroke();
    ctx.fillStyle = '#f8fafc'; ctx.textBaseline = 'middle'; ctx.font = '700 46px "Space Grotesk", Inter, sans-serif';
    ctx.fillText('Mien Wrapped', 150, 96);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8fafc'; ctx.font = '700 84px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(r.title, 90, 250);
    ctx.fillStyle = '#94a3b8'; ctx.font = '500 32px Inter, sans-serif';
    ctx.fillText(firstName ? `${firstName} · ${r.sub}` : r.sub, 90, 300);

    // big stat: top expression
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 26px Inter, sans-serif'; ctx.fillText('YOUR TOP EXPRESSION', 90, 400);
    ctx.fillStyle = color; ctx.font = '700 120px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(capWord(stats.top ? stats.top.name : '—'), 90, 520);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '500 32px Inter, sans-serif';
    if (stats.top) ctx.fillText(`${stats.top.pct}% of your scans`, 90, 570);

    // tiles
    const tiles = [
      ['HAPPIEST DAY', stats.happiest ? fmtDay(stats.happiest.day) : '—', stats.happiest ? `${Math.round(stats.happiest.score * 100)}% happy` : ''],
      ['BEST STREAK', `${stats.streak} day${stats.streak === 1 ? '' : 's'}`, `${stats.daysScanned} day${stats.daysScanned === 1 ? '' : 's'} scanned`],
      ['SCANS', String(stats.total), '']
    ];
    const tw = (W - 180 - 40) / 3;
    tiles.forEach(([k, v, sub], i) => {
      const x = 90 + i * (tw + 20), y = 640;
      ctx.fillStyle = 'rgba(148,163,184,0.10)'; _roundRect(ctx, x, y, tw, 190, 28); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.font = '600 22px Inter, sans-serif'; ctx.fillText(k, x + 24, y + 48);
      ctx.fillStyle = '#f8fafc'; ctx.font = '700 46px "Space Grotesk", Inter, sans-serif'; ctx.fillText(v, x + 24, y + 112);
      ctx.fillStyle = '#94a3b8'; ctx.font = '500 22px Inter, sans-serif'; ctx.fillText(sub, x + 24, y + 152);
    });

    // most surprised moment
    const sx = 90, sy = 870, sw = W - 180, sh = 300;
    ctx.fillStyle = 'rgba(148,163,184,0.10)'; _roundRect(ctx, sx, sy, sw, sh, 28); ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 22px Inter, sans-serif'; ctx.fillText('MOST SURPRISED MOMENT', sx + 36, sy + 56);
    const sur = stats.surprised && stats.surprised.score >= 0.15 ? stats.surprised : null;
    if (sur) {
      const img = await _loadImage(sur.scan.thumbnail);
      const ps = 190, px = sx + 36, py = sy + 84;
      ctx.save(); _roundRect(ctx, px, py, ps, ps, 24); ctx.clip();
      if (img) { const s = Math.max(ps / img.width, ps / img.height); ctx.drawImage(img, px + (ps - img.width * s) / 2, py + (ps - img.height * s) / 2, img.width * s, img.height * s); }
      else { ctx.fillStyle = '#1e293b'; ctx.fillRect(px, py, ps, ps); }
      ctx.restore();
      ctx.strokeStyle = emotionColor('surprised'); ctx.lineWidth = 4; _roundRect(ctx, px, py, ps, ps, 24); ctx.stroke();
      ctx.fillStyle = '#f8fafc'; ctx.font = '700 64px "Space Grotesk", Inter, sans-serif'; ctx.fillText(`${Math.round(sur.score * 100)}%`, px + ps + 40, py + 80);
      ctx.fillStyle = '#cbd5e1'; ctx.font = '500 30px Inter, sans-serif';
      ctx.fillText('surprised on ' + fmtDay(dayKey(new Date(sur.scan.created_at))), px + ps + 40, py + 130);
    } else {
      ctx.fillStyle = '#cbd5e1'; ctx.font = '500 34px Inter, sans-serif'; ctx.fillText('Nothing surprised you this time.', sx + 36, sy + 160);
    }

    ctx.fillStyle = '#94a3b8'; ctx.font = '500 26px Inter, sans-serif'; ctx.fillText('Analysed with Mien', 90, 1250);
    ctx.fillStyle = '#64748b'; ctx.font = '400 22px Inter, sans-serif'; ctx.fillText('Estimates only — not a medical or identity tool', 90, 1292);
    return c;
  }

  async function render() {
    const r = range(period);
    const list = scans.filter((s) => { const t = new Date(s.created_at); return t >= r.start && t < r.end; });
    const body = document.getElementById('wrapped-body'), empty = document.getElementById('empty');
    if (!list.length) {
      body.style.display = 'none'; empty.style.display = 'block'; lastBlob = null;
      document.getElementById('empty-msg').textContent = scans.length ? 'No saved scans in this period yet.' : 'Save a few scans and your Wrapped will appear here.';
      return;
    }
    empty.style.display = 'none'; body.style.display = 'block';
    const stats = compute(list);
    const canvas = await drawCard(stats, r);
    const wrap = document.getElementById('wrapped-canvas-wrap');
    wrap.innerHTML = ''; wrap.appendChild(canvas);
    document.getElementById('wrapped-note').textContent = list.length < 5 ? 'Tip: your Wrapped gets richer with more scans.' : '';
    lastBlob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  }

  document.getElementById('period-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    period = b.getAttribute('data-p');
    document.querySelectorAll('#period-tabs .mode-tab').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });

  document.getElementById('wrapped-share').addEventListener('click', async () => {
    const btn = document.getElementById('wrapped-share');
    if (!lastBlob) return;
    const old = btn.textContent; btn.disabled = true;
    const file = new File([lastBlob], 'mien-wrapped.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'My Mien Wrapped' }); btn.disabled = false; return; }
        catch (err) { if (err && err.name === 'AbortError') { btn.disabled = false; return; } }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(lastBlob); a.download = 'mien-wrapped.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      btn.textContent = 'Image saved ✓';
    } catch (_) { btn.textContent = 'Failed'; }
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1800);
  });

  render();
})();
