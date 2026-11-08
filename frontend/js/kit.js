// Bad Day Kit: your own note, your five happiest saved scans, and a one-minute
// breathing exercise. Everything comes from the person's own saved data.
(async function () {
  try { await Api.me(); } catch (_) { window.location.href = '/login.html?next=dashboard'; return; }

  const DEFAULT_NOTE = 'This will pass too.';
  let scans = [], note = '';
  try { scans = ownScans((await Api.getScans()).scans); } catch (_) {}
  try { note = (await fetch('/api/kit/note', { credentials: 'include' }).then((r) => r.json())).note || ''; } catch (_) {}

  document.getElementById('loading').style.display = 'none';
  document.getElementById('kit-body').style.display = 'block';

  // ---- 1. note ----
  const quote = document.getElementById('kit-quote');
  const editWrap = document.getElementById('kit-edit-wrap');
  const input = document.getElementById('kit-input');
  const editBtn = document.getElementById('kit-edit');
  function paintNote() {
    quote.textContent = note ? `“${note}”` : `“${DEFAULT_NOTE}”`;
    quote.classList.toggle('kit-default', !note);
    editBtn.textContent = note ? 'Edit my note' : 'Write my own note';
  }
  paintNote();
  editBtn.addEventListener('click', () => { input.value = note; editWrap.style.display = 'block'; editBtn.style.display = 'none'; input.focus(); });
  document.getElementById('kit-cancel').addEventListener('click', () => { editWrap.style.display = 'none'; editBtn.style.display = ''; });
  document.getElementById('kit-save').addEventListener('click', async () => {
    const msg = document.getElementById('kit-msg');
    msg.textContent = 'Saving…';
    try {
      const r = await fetch('/api/kit/note', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: input.value }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save');
      note = data.note || ''; paintNote();
      msg.textContent = '';
      editWrap.style.display = 'none'; editBtn.style.display = '';
    } catch (e) { msg.textContent = e.message; }
  });

  // ---- 2. happiest moments ----
  const ranked = scans
    .map((s) => ({ s, happy: parseExpr(s).happy }))
    .filter((x) => typeof x.happy === 'number' && x.happy >= 0.3)
    .sort((a, b) => b.happy - a.happy)
    .slice(0, 5);
  const box = document.getElementById('kit-happy');
  if (!ranked.length) {
    box.innerHTML = '<p class="muted" style="margin:0;">Nothing here yet. Save a few scans on good days and they will show up here when you need them.</p>';
  } else {
    box.innerHTML = ranked.map(({ s, happy }) => `
      <div class="kit-moment">
        ${s.thumbnail ? `<img src="${s.thumbnail}" alt="" />` : '<span class="kit-noimg">🙂</span>'}
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px;">${new Date(s.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div class="muted" style="font-size:12.5px;">${Math.round(happy * 100)}% happy${s.self_feeling ? ' · you said ' + escapeHtml(feelingOf(s.self_feeling).label.toLowerCase()) : ''}</div>
          ${s.note ? `<div style="font-size:13px; margin-top:3px; font-style:italic;">“${escapeHtml(s.note)}”</div>` : ''}
        </div>
      </div>`).join('');
  }

  // ---- 3. breathing (5s in, 5s out, 6 rounds = 60s) ----
  const btn = document.getElementById('breath-btn');
  const orb = document.getElementById('breath-orb');
  const text = document.getElementById('breath-text');
  const timer = document.getElementById('breath-timer');
  const TOTAL = 60;
  let running = null;

  function stop(msg) {
    if (running) { clearInterval(running); running = null; }
    orb.classList.remove('in'); orb.classList.remove('active');
    text.textContent = msg || 'Ready?';
    timer.textContent = '';
    btn.textContent = msg ? 'Go again' : 'Start (1 minute)';
  }

  btn.addEventListener('click', () => {
    if (running) { stop(); return; }
    let t = 0;
    btn.textContent = 'Stop';
    orb.classList.add('active');
    const tick = () => {
      if (t >= TOTAL) { stop('Well done. Take a moment.'); return; }
      const inhale = t % 10 < 5;
      text.textContent = inhale ? 'Breathe in…' : 'Breathe out…';
      orb.classList.toggle('in', inhale);
      timer.textContent = `${TOTAL - t}s left`;
      t++;
    };
    tick();
    running = setInterval(tick, 1000);
  });
})();
