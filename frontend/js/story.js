// Mood Story: a bento-grid summary of one period, built only from scans the
// person already saved. The share button renders a 1080x1350 PNG card.
(async function () {
  try { await Api.me(); } catch (_) { window.location.href = '/login.html?next=dashboard'; return; }

  let scans = [];
  try { scans = ownScans((await Api.getScans()).scans); }
  catch (err) { document.getElementById('loading').innerHTML = `<p class="muted center">Could not load your scans: ${escapeHtml(err.message)}</p>`; return; }
  document.getElementById('loading').style.display = 'none';

  let firstName = '';
  try { firstName = (await Api.me()).user.name.split(' ')[0]; } catch (_) {}

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const EMOJI = { happy: '😄', sad: '😢', angry: '😠', surprised: '😲', neutral: '😐', fearful: '😨', disgusted: '🤢', funny: '😆', excited: '🤩', shy: '😳', contempt: '😒' };
  let period = 'month';
  let current = null; // { stats, range, list }

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

  function compute(list, r) {
    const counts = {};
    list.forEach((s) => { if (s.dominant_expression) counts[s.dominant_expression] = (counts[s.dominant_expression] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];

    const byDay = {};
    list.forEach((s) => { const k = dayKey(new Date(s.created_at)); (byDay[k] = byDay[k] || []).push(s); });
    const days = Object.keys(byDay).sort();

    let happiest = null;
    days.forEach((k) => {
      const v = byDay[k].map((s) => parseExpr(s).happy).filter((x) => typeof x === 'number');
      if (!v.length) return;
      const a = v.reduce((x, y) => x + y, 0) / v.length;
      if (!happiest || a > happiest.score) happiest = { day: k, score: a };
    });

    let best = 0, run = 0, prev = null;
    days.forEach((k) => { const n = dayNumber(k); run = prev !== null && n - prev === 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; });

    let surprised = null;
    list.forEach((s) => {
      const v = parseExpr(s).surprised;
      if (typeof v === 'number' && (!surprised || v > surprised.score)) surprised = { scan: s, score: v };
    });

    // one coloured cell per calendar day of the period
    const cells = [];
    for (let d = new Date(r.start); d < r.end; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      const dayList = byDay[k];
      let emo = null;
      if (dayList) {
        const c = {};
        dayList.forEach((s) => { if (s.dominant_expression) c[s.dominant_expression] = (c[s.dominant_expression] || 0) + 1; });
        const t = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; emo = t ? t[0] : null;
      }
      cells.push({ key: k, day: d.getDate(), emo, future: d > new Date() });
    }

    return {
      total: list.length,
      top: top ? { name: top[0], pct: Math.round((top[1] / list.length) * 100) } : null,
      mix: ranked.map(([name, n]) => ({ name, pct: Math.round((n / list.length) * 100) })),
      happiest, streak: best, daysScanned: days.length, surprised, cells
    };
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
    ctx.fillText('Mood Story', 150, 96);

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

  function renderBento(st) {
    const topName = st.top ? st.top.name : null;
    const color = topName ? emotionColor(topName) : '#8b5cf6';
    const sur = st.surprised && st.surprised.score >= 0.15 ? st.surprised : null;
    const mixTop = st.mix.slice(0, 5);
    const other = Math.max(0, 100 - mixTop.reduce((a, b) => a + b.pct, 0));

    const tiles = [];
    tiles.push(`
      <section class="bt bt-hero" style="--c:${color};">
        <div class="bt-label">Top expression</div>
        <div class="bt-emoji">${topName ? EMOJI[topName] || '🙂' : '🙂'}</div>
        <div class="bt-hero-word">${topName ? capWord(topName) : '—'}</div>
        <div class="bt-sub">${st.top ? `<span data-count="${st.top.pct}">${st.top.pct}</span>% of your scans` : ''}</div>
      </section>`);
    tiles.push(`
      <section class="bt bt-streak">
        <div class="bt-label">Best streak</div>
        <div class="bt-big">🔥 <span data-count="${st.streak}">${st.streak}</span><small> day${st.streak === 1 ? '' : 's'}</small></div>
        <div class="bt-sub">${st.daysScanned} day${st.daysScanned === 1 ? '' : 's'} scanned</div>
      </section>`);
    tiles.push(`
      <section class="bt bt-scans">
        <div class="bt-label">Scans</div>
        <div class="bt-big"><span data-count="${st.total}">${st.total}</span></div>
        <div class="bt-sub">this period</div>
      </section>`);
    tiles.push(`
      <section class="bt bt-happy">
        <div class="bt-label">Happiest day</div>
        <div class="bt-big" style="font-size:34px;">${st.happiest ? fmtDay(st.happiest.day) : '—'}</div>
        <div class="bt-sub">${st.happiest ? `${Math.round(st.happiest.score * 100)}% happy on average` : 'No data yet'}</div>
        <span class="bt-spark">✨</span>
      </section>`);
    tiles.push(`
      <section class="bt bt-mix">
        <div class="bt-label">Your expression mix</div>
        <div class="mixbar">${mixTop.map((m) => `<i style="width:${m.pct}%; background:${emotionColor(m.name)};" title="${capWord(m.name)} ${m.pct}%"></i>`).join('')}${other ? `<i style="width:${other}%; background:var(--border);"></i>` : ''}</div>
        <ul class="mixlegend">${mixTop.map((m) => `<li><span class="dot" style="background:${emotionColor(m.name)}"></span>${capWord(m.name)} <b>${m.pct}%</b></li>`).join('')}</ul>
      </section>`);
    tiles.push(`
      <section class="bt bt-surprise">
        <div class="bt-label">Most surprised moment</div>
        ${sur ? `<div class="bt-sur-row">
          ${sur.scan.thumbnail ? `<img src="${sur.scan.thumbnail}" alt="" />` : '<span class="kt-noimg">😲</span>'}
          <div><div class="bt-big" style="font-size:34px;">${Math.round(sur.score * 100)}%</div><div class="bt-sub">on ${fmtDay(dayKey(new Date(sur.scan.created_at)))}</div></div>
        </div>` : '<div class="bt-sub" style="margin-top:14px; font-size:15px;">Nothing surprised you this time 😌</div>'}
      </section>`);
    tiles.push(`
      <section class="bt bt-days">
        <div class="bt-label">Day by day</div>
        <div class="daystrip">${st.cells.map((c) => `<span class="dcell${c.emo ? ' has' : ''}${c.future ? ' fut' : ''}" style="${c.emo ? `--c:${emotionColor(c.emo)};` : ''}" title="${fmtDay(c.key)}${c.emo ? ' · ' + capWord(c.emo) : ''}">${c.day}</span>`).join('')}</div>
      </section>`);

    const el = document.getElementById('bento');
    el.innerHTML = tiles.join('');
    el.querySelectorAll('.bt').forEach((t, i) => { t.style.animationDelay = `${i * 70}ms`; });
    animateResults(el);
  }

  async function render() {
    const r = range(period);
    document.getElementById('ms-title').textContent = r.title;
    document.getElementById('ms-sub').textContent = r.sub;
    const list = scans.filter((s) => { const t = new Date(s.created_at); return t >= r.start && t < r.end; });
    const body = document.getElementById('ms-body'), empty = document.getElementById('empty');
    if (!list.length) {
      body.style.display = 'none'; empty.style.display = 'block'; current = null;
      document.getElementById('empty-msg').textContent = scans.length ? 'No saved scans in this period yet.' : 'Save a few scans and your Mood Story will appear here.';
      return;
    }
    empty.style.display = 'none'; body.style.display = 'block';
    const stats = compute(list, r);
    current = { stats, range: r };
    renderBento(stats);
    document.getElementById('story-note').textContent = list.length < 5 ? 'Tip: your story gets richer with more scans.' : '';
  }

  document.getElementById('period-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    period = b.getAttribute('data-p');
    document.querySelectorAll('#period-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });

  document.getElementById('story-share').addEventListener('click', async () => {
    const btn = document.getElementById('story-share');
    if (!current) return;
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const canvas = await drawCard(current.stats, current.range);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], 'mien-mood-story.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'My Mood Story' }); btn.textContent = old; btn.disabled = false; return; }
        catch (err) { if (err && err.name === 'AbortError') { btn.textContent = old; btn.disabled = false; return; } }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'mien-mood-story.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      btn.textContent = 'Image saved ✓';
    } catch (_) { btn.textContent = 'Failed'; }
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1800);
  });

  render();
})();
