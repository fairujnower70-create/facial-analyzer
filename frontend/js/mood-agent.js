// Mood Buddy: a floating AI companion available on every signed-in page.
// The conversation lives only in this browser tab (sessionStorage) and is
// never saved on the server. Pages can pass the latest scan via MoodAgent.setLive().
(function () {
  if (window.MoodAgent) return;
  const KEY = 'mien-agent-chat';
  const GREETING = "Hi, I'm Mood Buddy. How are you feeling right now? You can tell me in your own words.";
  const CHIPS = ['I feel low', "I'm doing great", 'Help me calm down', 'Just want to talk'];

  let state = { open: false, msgs: [] };
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.msgs)) state = s; } catch (_) {}
  let live = null, built = false, busy = false;
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ open: state.open, msgs: state.msgs.slice(-30) })); } catch (_) {} };

  // Available immediately so scan pages can call it before the UI exists.
  window.MoodAgent = {
    setLive(obj) {
      live = obj && (obj.face || obj.feeling) ? { face: obj.face || null, feeling: obj.feeling || null } : null;
      const fab = document.getElementById('ma-fab');
      if (fab && !state.open && live) fab.classList.add('nudge');
    }
  };

  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };

  function build() {
    if (built) return; built = true;
    const fab = el('<button type="button" class="ma-fab" id="ma-fab" aria-label="Open Mood Buddy chat"><span aria-hidden="true">💬</span></button>');
    const panel = el(`
      <section class="ma-panel" id="ma-panel" role="dialog" aria-label="Mood Buddy chat" hidden>
        <header class="ma-head">
          <div><b>Mood Buddy</b><small>AI companion · not a therapist</small></div>
          <div class="ma-head-actions"><button type="button" id="ma-clear" class="ma-link">Clear</button><button type="button" id="ma-close" class="ma-x" aria-label="Close">×</button></div>
        </header>
        <div class="ma-msgs" id="ma-msgs" aria-live="polite"></div>
        <div class="ma-chips" id="ma-chips"></div>
        <form class="ma-form" id="ma-form">
          <input id="ma-input" maxlength="500" autocomplete="off" placeholder="Tell me how you're feeling…" />
          <button type="submit" id="ma-send">Send</button>
        </form>
        <p class="ma-foot">Your messages go to an AI service to write replies and are not saved on Mien. Please don't share passwords or ID numbers.</p>
      </section>`);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', () => toggle(true));
    document.getElementById('ma-close').addEventListener('click', () => toggle(false));
    document.getElementById('ma-clear').addEventListener('click', () => { state.msgs = []; save(); paint(); });
    document.getElementById('ma-form').addEventListener('submit', (e) => { e.preventDefault(); send(); });
    document.getElementById('ma-chips').addEventListener('click', (e) => { const c = e.target.closest('.ma-chip'); if (c) send(c.textContent); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) toggle(false); });
    paint();
    toggle(state.open, true);
  }

  function toggle(open, silent) {
    state.open = open;
    const panel = document.getElementById('ma-panel'), fab = document.getElementById('ma-fab');
    panel.hidden = !open;
    fab.classList.toggle('hide', open);
    if (open) { fab.classList.remove('nudge'); scroll(); if (!silent) document.getElementById('ma-input').focus(); }
    save();
  }

  function scroll() { const m = document.getElementById('ma-msgs'); m.scrollTop = m.scrollHeight; }

  function bubble(m) {
    const d = document.createElement('div');
    d.className = `ma-b ${m.role === 'user' ? 'me' : 'bot'}${m.crisis ? ' crisis' : ''}`;
    d.textContent = m.content;
    if (m.fallback) { const s = document.createElement('small'); s.textContent = 'Simple mode: the AI service is busy right now.'; d.appendChild(s); }
    return d;
  }

  function paint() {
    const box = document.getElementById('ma-msgs');
    box.innerHTML = '';
    box.appendChild(bubble({ role: 'assistant', content: GREETING }));
    state.msgs.forEach((m) => box.appendChild(bubble(m)));
    document.getElementById('ma-chips').style.display = state.msgs.length ? 'none' : 'flex';
    document.getElementById('ma-chips').innerHTML = CHIPS.map((c) => `<button type="button" class="ma-chip">${c}</button>`).join('');
    scroll();
  }

  async function send(text) {
    const input = document.getElementById('ma-input');
    const message = (text || input.value).trim();
    if (!message || busy) return;
    busy = true; input.value = '';
    const history = state.msgs.filter((m) => !m.crisis && !m.local).slice(-8).map((m) => ({ role: m.role, content: m.content }));
    state.msgs.push({ role: 'user', content: message });
    paint();
    const box = document.getElementById('ma-msgs');
    const typing = el('<div class="ma-b bot ma-typing"><i></i><i></i><i></i></div>');
    box.appendChild(typing); scroll();
    document.getElementById('ma-send').disabled = true;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, live })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'failed');
      state.msgs.push({ role: 'assistant', content: data.reply, crisis: !!data.crisis, fallback: !!data.fallback, local: !!data.limited });
    } catch (_) {
      state.msgs.push({ role: 'assistant', content: "I couldn't reach the server just now. Please try again in a moment.", local: true });
    }
    busy = false;
    document.getElementById('ma-send').disabled = false;
    save(); paint();
  }

  async function boot() {
    try { await Api.me(); } catch (_) { return; } // only for signed-in people
    build();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
