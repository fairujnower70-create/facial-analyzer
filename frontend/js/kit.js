// Bad Day Kit: your own note, your happiest saved scans, and a one-minute
// breathing exercise. Everything comes from the person's own saved data.
(async function () {
  try { await Api.me(); } catch (_) { window.location.href = '/login.html?next=dashboard'; return; }

  const DEFAULT_NOTE = 'This will pass too.';
  const IDEAS = [
    'This will pass too.',
    "You've survived every bad day so far.",
    'Be gentle with yourself today.',
    'One small step is enough.',
    'Tomorrow is a fresh start.',
    "I'm doing my best, and that's enough."
  ];
  let scans = [], note = '';
  try { scans = ownScans((await Api.getScans()).scans); } catch (_) {}
  try { note = (await fetch('/api/kit/note', { credentials: 'include' }).then((r) => r.json())).note || ''; } catch (_) {}

  document.getElementById('loading').style.display = 'none';
  document.getElementById('kit-body').style.display = 'grid';

  // ---- 1. note ----
  const quote = document.getElementById('kit-quote');
  const editWrap = document.getElementById('kit-edit-wrap');
  const input = document.getElementById('kit-input');
  const editBtn = document.getElementById('kit-edit');
  function paintNote() {
    quote.textContent = `“${note || DEFAULT_NOTE}”`;
    quote.classList.toggle('kt-default', !note);
    editBtn.textContent = note ? 'Edit' : 'Write your own';
  }
  paintNote();
  const chips = document.getElementById('kit-chips');
  chips.innerHTML = '<span class="muted" style="font-size:12px;">Need an idea? Tap one:</span>' +
    IDEAS.map((t) => `<button type="button" class="kt-chip">${escapeHtml(t)}</button>`).join('');
  chips.addEventListener('click', (e) => { const c = e.target.closest('.kt-chip'); if (c) { input.value = c.textContent; input.focus(); } });
  const openEdit = () => { input.value = note; editWrap.style.display = 'block'; quote.style.display = 'none'; editBtn.style.display = 'none'; input.focus(); };
  const closeEdit = () => { editWrap.style.display = 'none'; quote.style.display = ''; editBtn.style.display = ''; };
  editBtn.addEventListener('click', openEdit);
  document.getElementById('kit-cancel').addEventListener('click', closeEdit);
  document.getElementById('kit-save').addEventListener('click', async () => {
    const msg = document.getElementById('kit-msg');
    msg.textContent = 'Saving…';
    try {
      const r = await fetch('/api/kit/note', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: input.value }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save');
      note = data.note || ''; paintNote(); msg.textContent = ''; closeEdit();
    } catch (e) { msg.textContent = e.message; }
  });

  // ---- 2. happiest moments (scrollable cards, tap for a bigger view) ----
  const ranked = scans
    .map((s) => ({ s, happy: parseExpr(s).happy }))
    .filter((x) => typeof x.happy === 'number' && x.happy >= 0.3)
    .sort((a, b) => b.happy - a.happy)
    .slice(0, 5);
  const rail = document.getElementById('kit-happy');
  const fmt = (s) => new Date(s.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  if (!ranked.length) {
    rail.classList.remove('kt-rail');
    rail.innerHTML = '<p class="muted" style="margin:0;">Nothing here yet. Save a few scans on good days (add a short note too) and they will show up here when you need them.</p>';
  } else {
    rail.innerHTML = ranked.map(({ s, happy }, i) => `
      <button type="button" class="kt-photo" data-i="${i}">
        ${s.thumbnail ? `<img src="${s.thumbnail}" alt="" />` : '<span class="kt-noimg big">🙂</span>'}
        <span class="kt-photo-shade"></span>
        <span class="kt-pill">${Math.round(happy * 100)}% happy</span>
        <span class="kt-photo-info"><b>${fmt(s)}</b>${s.note ? `<em>“${escapeHtml(s.note)}”</em>` : ''}</span>
      </button>`).join('');
    const lb = document.getElementById('kt-lb');
    rail.addEventListener('click', (e) => {
      const b = e.target.closest('.kt-photo'); if (!b) return;
      const { s, happy } = ranked[Number(b.getAttribute('data-i'))];
      lb.innerHTML = `<div class="kt-lb-card">
        ${s.thumbnail ? `<img src="${s.thumbnail}" alt="" />` : ''}
        <div style="padding:14px 4px 4px;"><b>${fmt(s)}</b> · ${Math.round(happy * 100)}% happy${s.self_feeling ? ' · you said ' + escapeHtml(feelingOf(s.self_feeling).label.toLowerCase()) : ''}
        ${s.note ? `<div style="font-style:italic; margin-top:6px;">“${escapeHtml(s.note)}”</div>` : ''}</div>
        <button class="btn btn-ghost" type="button" id="kt-lb-close" style="margin-top:10px;">Close</button></div>`;
      lb.style.display = 'flex';
    });
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'kt-lb-close') lb.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.style.display = 'none'; });
  }

  // ---- 3. breathing (5s in, 5s out, 6 rounds = 60s) ----
  const btn = document.getElementById('breath-btn');
  const orb = document.getElementById('breath-orb');
  const stage = document.getElementById('breath-stage');
  const text = document.getElementById('breath-text');
  const timer = document.getElementById('breath-timer');
  const prog = document.getElementById('breath-prog');
  const TOTAL = 60;
  let running = null;

  function stop(msg) {
    if (running) { clearInterval(running); running = null; }
    orb.classList.remove('in'); stage.classList.remove('active');
    prog.style.width = '0%';
    text.textContent = msg || 'Ready?';
    timer.textContent = msg ? '' : '5 seconds in, 5 seconds out';
    btn.textContent = msg ? 'Go again' : 'Start';
  }

  btn.addEventListener('click', () => {
    if (running) { stop(); return; }
    let t = 0;
    btn.textContent = 'Stop';
    stage.classList.add('active');
    const tick = () => {
      if (t >= TOTAL) { prog.style.width = '100%'; stop('Well done. Take a moment.'); return; }
      const inhale = t % 10 < 5;
      text.textContent = inhale ? 'Breathe in' : 'Breathe out';
      orb.classList.toggle('in', inhale);
      timer.textContent = `${TOTAL - t}s left`;
      prog.style.width = `${((t + 1) / TOTAL) * 100}%`;
      t++;
    };
    tick();
    running = setInterval(tick, 1000);
  });
})();
