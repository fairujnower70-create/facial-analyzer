// Kinesin: a tiny, cute robot companion that lives in the bottom-left corner
// of every signed-in page. He can talk (using the same /api/chat as Mood Buddy,
// with a local fallback), sing a little song, dance, tell jokes and guide a
// short breathing exercise. His voice is the browser's text-to-speech, pitched
// up to sound like a little robot; the music is made live with WebAudio.
// Nothing is stored on the server. He is a friendly companion, not a therapist.
(function () {
  if (window.Kinesin) return;

  const LS = 'mien-kinesin';
  let prefs = { muted: false, hidden: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (_) {}
  const savePrefs = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (_) {} };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- styles
  const css = `
  .kin{position:fixed;left:14px;bottom:14px;z-index:140;font-family:inherit}
  body.has-tabbar .kin{bottom:86px}
  .kin-bot{position:relative;width:86px;height:100px;border:0;padding:0;background:none;cursor:pointer;display:block;-webkit-tap-highlight-color:transparent}
  .kin-bot svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 8px 14px rgba(99,102,241,.45))}
  .kin.hidden .kin-bot{width:46px;height:54px;opacity:.85}
  .kin-cap{position:absolute;left:70px;bottom:78px;max-width:230px;padding:9px 12px;border-radius:16px 16px 16px 4px;background:var(--bg-card,#0f172a);color:var(--text-primary,#f8fafc);border:1px solid var(--border,rgba(148,163,184,.3));font-size:13.5px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;transform:translateY(6px) scale(.96);transform-origin:left bottom;pointer-events:none;transition:opacity .25s,transform .25s}
  .kin-cap.on{opacity:1;transform:none}
  .kin-panel{position:absolute;left:0;bottom:108px;width:332px;max-width:calc(100vw - 28px);max-height:min(520px,calc(100vh - 150px));display:flex;flex-direction:column;border-radius:22px;border:1px solid var(--border,rgba(148,163,184,.3));background:var(--bg-card,#0b1220);box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden}
  .kin-panel[hidden]{display:none}
  .kin-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border,rgba(148,163,184,.3));background:linear-gradient(135deg,rgba(99,102,241,.28),rgba(34,211,238,.12))}
  .kin-head b{display:block;font-size:15px;color:var(--text-primary,#f8fafc)}
  .kin-head small{font-size:11.5px;color:var(--text-muted,#94a3b8)}
  .kin-head .kin-ic{display:flex;gap:6px}
  .kin-ib{border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:var(--text-muted,#94a3b8);width:30px;height:30px;border-radius:10px;cursor:pointer;font-size:14px;line-height:1}
  .kin-ib:hover{color:var(--text-primary,#f8fafc);border-color:#8b5cf6}
  .kin-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:90px}
  .kin-m{max-width:88%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
  .kin-m.k{align-self:flex-start;background:var(--bg-input,#1e293b);color:var(--text-primary,#f8fafc);border-bottom-left-radius:4px}
  .kin-m.u{align-self:flex-end;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-bottom-right-radius:4px}
  .kin-m.crisis{border:1px solid #f59e0b}
  .kin-acts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 12px 8px}
  .kin-act{border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:var(--text-primary,#f8fafc);border-radius:12px;padding:7px 2px;font:inherit;font-size:11.5px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
  .kin-act span{font-size:18px;line-height:1.1}
  .kin-act:hover,.kin-act.on{border-color:#8b5cf6;background:rgba(139,92,246,.16)}
  .kin-moods{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
  .kin-chip{border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:var(--text-muted,#94a3b8);border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer}
  .kin-chip:hover{color:var(--text-primary,#f8fafc);border-color:#8b5cf6}
  .kin-form{display:flex;gap:6px;padding:8px 12px 10px;border-top:1px solid var(--border,rgba(148,163,184,.3))}
  .kin-form input{flex:1;min-width:0;padding:9px 11px;border-radius:12px;border:1px solid var(--border,rgba(148,163,184,.3));background:var(--bg-input,#1e293b);color:var(--text-primary,#f8fafc);font:inherit;font-size:13.5px}
  .kin-form button{border:0;border-radius:12px;padding:0 13px;font:inherit;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6)}
  .kin-form .kin-mic{background:var(--bg-input,#1e293b);color:var(--text-primary,#f8fafc);border:1px solid var(--border,rgba(148,163,184,.3))}
  .kin-form .kin-mic.rec{background:#ef4444;border-color:#ef4444;color:#fff}
  .kin-foot{margin:0;padding:0 14px 10px;font-size:10.5px;line-height:1.4;color:var(--text-muted,#94a3b8)}
  .kin-notes{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
  .kin-note{position:absolute;left:50%;top:28%;font-size:20px;color:#a78bfa;opacity:0;animation:kinNote 2.4s ease-out forwards}
  @keyframes kinNote{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),-70px) rotate(var(--r)) scale(1.1)}}

  /* ---- robot parts ---- */
  .kin-bot svg *{transform-box:fill-box}
  #k-root{transform-origin:50% 100%}
  .kin:not(.still) #k-root{animation:kBob 3.2s ease-in-out infinite}
  .kin-bulb{animation:kGlow 2.2s ease-in-out infinite}
  .kin .eyes-n{animation:kBlink 4.5s infinite;transform-origin:50% 50%}
  .kin .eyes-h,.kin .eyes-s,.kin .m-open,.kin .m-sad,.kin .tear{display:none}
  .kin.laugh .eyes-n,.kin.sing .eyes-n,.kin.dance .eyes-n{display:none}
  .kin.laugh .eyes-h,.kin.sing .eyes-h,.kin.dance .eyes-h{display:block}
  .kin.sad .eyes-n{display:none}.kin.sad .eyes-s,.kin.sad .m-sad,.kin.sad .tear{display:block}
  .kin.sad .m-smile,.kin.laugh .m-smile,.kin.sing .m-smile,.kin.dance .m-smile{display:none}
  .kin.talk .m-sad{display:none}
  .kin.talk .m-smile{display:none}.kin.talk .m-open{display:block;animation:kTalk .22s ease-in-out infinite alternate;transform-origin:50% 40%}
  .kin.laugh .m-open,.kin.sing .m-open{display:block;animation:kTalk .3s ease-in-out infinite alternate;transform-origin:50% 40%}
  .kin.dance .m-open{display:block}
  .kin.laugh #k-root{animation:kLaugh .28s ease-in-out infinite}
  .kin.sing #k-root{animation:kSway 1.6s ease-in-out infinite}
  .kin.dance #k-root{animation:kHop .6s ease-in-out infinite}
  .kin.dance .arm-l{animation:kArmL .6s ease-in-out infinite;transform-origin:90% 10%}
  .kin.dance .arm-r{animation:kArmR .6s ease-in-out infinite;transform-origin:10% 10%}
  .kin.sing .arm-l{animation:kArmL 1.6s ease-in-out infinite;transform-origin:90% 10%}
  .kin.sing .arm-r{animation:kArmR 1.6s ease-in-out infinite;transform-origin:10% 10%}
  .kin.breathe #k-root{animation:kBreath 10s ease-in-out infinite}
  .kin.breathe .eyes-n{display:none}.kin.breathe .eyes-h{display:block}
  @keyframes kBob{50%{transform:translateY(-4px)}}
  @keyframes kBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
  @keyframes kGlow{50%{opacity:.45}}
  @keyframes kTalk{from{transform:scaleY(.5)}to{transform:scaleY(1.2)}}
  @keyframes kLaugh{50%{transform:translateY(-6px) rotate(-3deg)}0%,100%{transform:translateY(0) rotate(3deg)}}
  @keyframes kSway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
  @keyframes kHop{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-12px) rotate(5deg)}}
  @keyframes kArmL{0%,100%{transform:rotate(30deg)}50%{transform:rotate(-120deg)}}
  @keyframes kArmR{0%,100%{transform:rotate(-120deg)}50%{transform:rotate(30deg)}}
  @keyframes kBreath{0%,100%{transform:scale(.94)}40%{transform:scale(1.1)}60%{transform:scale(1.1)}}
  @media (prefers-reduced-motion: reduce){.kin *{animation-duration:0s!important;animation:none!important}.kin-note{display:none}}
  @media (max-width:600px){.kin-panel{position:fixed;left:8px;right:8px;bottom:96px;width:auto;max-width:none}body.has-tabbar .kin-panel{bottom:168px}.kin-cap{max-width:190px}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------------------------------------------------------------- DOM
  const robotSvg = `
  <svg viewBox="0 0 120 140" aria-hidden="true">
    <defs>
      <linearGradient id="kg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
      <linearGradient id="kg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a5b4fc"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
    </defs>
    <g id="k-root">
      <line x1="60" y1="22" x2="60" y2="8" stroke="#a5b4fc" stroke-width="3" stroke-linecap="round"/>
      <circle class="kin-bulb" cx="60" cy="7" r="5.5" fill="#22d3ee"/>
      <g class="arm-l"><rect x="14" y="78" width="14" height="30" rx="7" fill="url(#kg2)" transform="rotate(8 21 80)"/></g>
      <g class="arm-r"><rect x="92" y="78" width="14" height="30" rx="7" fill="url(#kg2)" transform="rotate(-8 99 80)"/></g>
      <rect x="40" y="108" width="14" height="20" rx="6" fill="#6366f1"/><rect x="66" y="108" width="14" height="20" rx="6" fill="#6366f1"/>
      <rect x="34" y="72" width="52" height="42" rx="18" fill="url(#kg1)"/>
      <path d="M60 99c-7-5-11-8-11-12a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 4-4 7-11 12z" fill="#fb7185" opacity=".95"/>
      <circle cx="21" cy="46" r="6" fill="#6366f1"/><circle cx="99" cy="46" r="6" fill="#6366f1"/>
      <rect x="20" y="20" width="80" height="62" rx="28" fill="url(#kg1)"/>
      <rect x="28" y="30" width="64" height="42" rx="20" fill="#0b1226"/>
      <g class="eyes-n"><ellipse cx="46" cy="49" rx="6" ry="8" fill="#67e8f9"/><ellipse cx="74" cy="49" rx="6" ry="8" fill="#67e8f9"/>
        <circle cx="48" cy="46" r="2" fill="#fff"/><circle cx="76" cy="46" r="2" fill="#fff"/></g>
      <g class="eyes-h" fill="none" stroke="#67e8f9" stroke-width="4" stroke-linecap="round"><path d="M40 52q6-9 12 0"/><path d="M68 52q6-9 12 0"/></g>
      <g class="eyes-s"><ellipse cx="46" cy="51" rx="6" ry="7" fill="#67e8f9"/><ellipse cx="74" cy="51" rx="6" ry="7" fill="#67e8f9"/>
        <path d="M38 41l14 4M82 41l-14 4" stroke="#67e8f9" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="48" r="2" fill="#fff"/><circle cx="76" cy="48" r="2" fill="#fff"/></g>
      <ellipse class="tear" cx="40" cy="62" rx="2.4" ry="3.6" fill="#93c5fd"/>
      <circle cx="36" cy="62" r="4.5" fill="#fb7185" opacity=".45"/><circle cx="84" cy="62" r="4.5" fill="#fb7185" opacity=".45"/>
      <path class="m-smile" d="M52 62q8 8 16 0" fill="none" stroke="#67e8f9" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse class="m-open" cx="60" cy="64" rx="6.5" ry="5" fill="#67e8f9"/>
      <path class="m-sad" d="M53 67q7-7 14 0" fill="none" stroke="#67e8f9" stroke-width="3.5" stroke-linecap="round"/>
    </g>
  </svg>`;

  const root = document.createElement('div');
  root.className = 'kin' + (prefs.hidden ? ' hidden' : '');
  root.innerHTML = `
    <div class="kin-cap" id="kin-cap" role="status" aria-live="polite"></div>
    <section class="kin-panel" id="kin-panel" role="dialog" aria-label="Kinesin the robot" hidden>
      <header class="kin-head">
        <div><b>Kinesin 🤖</b><small>Tiny robot friend · not a therapist</small></div>
        <div class="kin-ic">
          <button type="button" class="kin-ib" id="kin-mute" title="Voice on/off" aria-label="Voice on or off">🔊</button>
          <button type="button" class="kin-ib" id="kin-min" title="Tuck away" aria-label="Tuck Kinesin away">–</button>
          <button type="button" class="kin-ib" id="kin-x" title="Close" aria-label="Close">×</button>
        </div>
      </header>
      <div class="kin-log" id="kin-log" aria-live="polite"></div>
      <div class="kin-moods" id="kin-moods">
        <button type="button" class="kin-chip" data-m="sad">😔 I feel sad</button>
        <button type="button" class="kin-chip" data-m="stressed">😣 I'm stressed</button>
        <button type="button" class="kin-chip" data-m="bored">🥱 Cheer me up</button>
        <button type="button" class="kin-chip" data-m="happy">😄 I'm happy</button>
      </div>
      <div class="kin-acts">
        <button type="button" class="kin-act" data-a="sing"><span>🎵</span>Sing</button>
        <button type="button" class="kin-act" data-a="dance"><span>💃</span>Dance</button>
        <button type="button" class="kin-act" data-a="joke"><span>😂</span>Joke</button>
        <button type="button" class="kin-act" data-a="breathe"><span>🌬️</span>Breathe</button>
      </div>
      <form class="kin-form" id="kin-form">
        <input id="kin-in" maxlength="500" autocomplete="off" placeholder="Talk to Kinesin…" />
        <button type="button" class="kin-mic" id="kin-mic" title="Speak" aria-label="Speak" hidden>🎤</button>
        <button type="submit">Send</button>
      </form>
      <p class="kin-foot">Kinesin's voice is your device's text-to-speech. Chat messages go to an AI service to write replies and are not saved on Mien. Please don't share passwords or ID numbers.</p>
    </section>
    <button type="button" class="kin-bot" id="kin-bot" aria-label="Open Kinesin the robot">${robotSvg}<div class="kin-notes" id="kin-notes"></div></button>`;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  const cap = $('kin-cap'), panel = $('kin-panel'), log = $('kin-log'), input = $('kin-in');

  // ---------------------------------------------------------------- helpers
  let token = 0;               // bumping this cancels whatever Kinesin is doing
  let capTimer = null, beatTimer = null, actx = null, master = null;
  let busy = false, greeted = false;
  const sleep = (ms, t) => new Promise((res) => setTimeout(res, ms));
  const alive = (t) => t === token;
  const mode = (...names) => {
    ['talk', 'sing', 'dance', 'laugh', 'sad', 'breathe'].forEach((n) => root.classList.remove(n));
    names.forEach((n) => n && root.classList.add(n));
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function caption(text, ms) {
    cap.textContent = text;
    cap.classList.add('on');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => cap.classList.remove('on'), ms || Math.max(3200, text.length * 55));
  }
  function addMsg(who, text, crisis) {
    const d = document.createElement('div');
    d.className = 'kin-m ' + (who === 'u' ? 'u' : 'k') + (crisis ? ' crisis' : '');
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function floatNote(sym) {
    if (reduce) return;
    const n = document.createElement('span');
    n.className = 'kin-note';
    n.textContent = sym || pick(['♪', '♫', '♬', '♩']);
    n.style.setProperty('--dx', (Math.random() * 90 - 45) + 'px');
    n.style.setProperty('--r', (Math.random() * 40 - 20) + 'deg');
    n.style.marginLeft = (Math.random() * 40 - 20) + 'px';
    $('kin-notes').appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  // ---------------------------------------------------------------- voice
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = null;
  function chooseVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    if (!vs.length) return;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    voice = en.find((v) => /female|samantha|zira|google uk english female|aria|jenny|natural/i.test(v.name)) || en[0] || vs[0];
  }
  if (synth) { chooseVoice(); synth.addEventListener && synth.addEventListener('voiceschanged', chooseVoice); }

  // Speaks a line in Kinesin's little robot voice (high pitch). Resolves when
  // finished; if voice is muted/unsupported it just waits a reading-time.
  function say(text, opts, t) {
    opts = opts || {};
    const wait = Math.max(900, text.length * 62);
    if (!synth || prefs.muted) return sleep(wait).then(() => {});
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.pitch = opts.pitch || 1.75;
        u.rate = opts.rate || 1.02;
        u.volume = 1;
        u.onend = fin; u.onerror = fin;
        synth.speak(u);
        setTimeout(fin, wait * 2.5 + 3000);
      } catch (_) { fin(); }
    });
  }

  // ---------------------------------------------------------------- music (WebAudio)
  function audio() {
    if (prefs.muted) return null;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
        master = actx.createGain(); master.gain.value = 0.5;
        master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (_) { return null; }
  }
  function tone(freq, start, dur, type, vol) {
    const c = audio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    const t0 = c.currentTime + (start || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const note = (semi) => 261.63 * Math.pow(2, semi / 12); // semitones above middle C
  function drum(kind) {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.14);
      g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.2);
    } else {
      const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000; g.gain.value = 0.18;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t0);
    }
  }

  // ---------------------------------------------------------------- stop
  function stopAll() {
    token++;
    clearInterval(beatTimer); beatTimer = null;
    try { synth && synth.cancel(); } catch (_) {}
    mode();
    root.classList.remove('still');
    document.querySelectorAll('.kin-act.on').forEach((b) => b.classList.remove('on'));
    busy = false;
  }

  // ---------------------------------------------------------------- behaviours
  const SONG = [
    { words: 'La la la, you are doing fine', n: [0, 4, 7, 9, 7, 4, 7] },
    { words: 'Little clouds will pass in time', n: [9, 7, 4, 2, 4, 0, 2] },
    { words: 'Breathe in slow, and out again', n: [4, 7, 9, 12, 9, 7, 4] },
    { words: 'Sunshine comes after the rain', n: [7, 9, 12, 9, 7, 4, 0] },
    { words: 'La la la, you are not alone', n: [0, 4, 7, 9, 12, 9, 7] },
    { words: 'Kinesin is right here with you', n: [9, 7, 4, 7, 4, 2, 0] }
  ];
  async function sing() {
    stopAll(); const t = token; busy = true;
    $('kin-panel') && document.querySelector('[data-a="sing"]').classList.add('on');
    mode('sing');
    addMsg('k', '🎵 A little song for you:');
    for (const line of SONG) {
      if (!alive(t)) return;
      caption('♪ ' + line.words + ' ♪', 4000);
      addMsg('k', '♪ ' + line.words);
      line.n.forEach((s, i) => { tone(note(s), i * 0.42, 0.5, 'triangle', 0.12); tone(note(s - 12), i * 0.42, 0.55, 'sine', 0.07); });
      for (let i = 0; i < 4; i++) setTimeout(() => alive(t) && floatNote(), i * 600);
      await say(line.words, { pitch: 1.9, rate: 0.82 }, t);
      await sleep(1900 - Math.min(1500, line.words.length * 40));
    }
    if (!alive(t)) return;
    mode('laugh'); caption('Thank you for listening! 💜', 3000);
    addMsg('k', 'Thank you for listening! 💜');
    await sleep(1200); if (!alive(t)) return;
    stopAll();
  }

  async function dance() {
    stopAll(); const t = token; busy = true;
    document.querySelector('[data-a="dance"]').classList.add('on');
    mode('dance');
    caption('Beep boop, dance time! 💃', 3000);
    addMsg('k', "Beep boop, dance time! Let's wiggle those worries away 💃");
    const melody = [0, 4, 7, 4, 9, 7, 4, 2];
    let step = 0;
    beatTimer = setInterval(() => {
      if (!alive(t)) return;
      drum(step % 2 === 0 ? 'kick' : 'hat');
      if (step % 2 === 0) tone(note(melody[(step / 2) % melody.length | 0] + 12), 0, 0.22, 'square', 0.06);
      if (step % 4 === 0) floatNote(pick(['♪', '✨', '♫']));
      step++;
    }, 270);
    say('Wheee! Look at me go!', { pitch: 1.9, rate: 1.1 }, t);
    await sleep(13000);
    if (!alive(t)) return;
    stopAll();
    mode('laugh'); caption('Phew! That was fun. 😄', 2500);
    addMsg('k', 'Phew! That was fun. Your turn to move a little?');
    await sleep(1400); stopAll();
  }

  const JOKES = [
    ['Why did the robot go on vacation?', 'To recharge its batteries!'],
    ['What do you call a sleeping dinosaur?', 'A dino-snore!'],
    ["Why don't eggs tell jokes?", "They'd crack each other up!"],
    ['What did the ocean say to the beach?', 'Nothing, it just waved!'],
    ['Why did the scarecrow win an award?', 'He was outstanding in his field!'],
    ['What do you call a fake noodle?', 'An impasta!'],
    ['Why was the computer cold?', 'It left its Windows open!'],
    ['What do clouds wear under their clothes?', 'Thunderwear!'],
    ['Why did the banana go to the doctor?', "It wasn't peeling well!"],
    ['How does a robot eat guacamole?', 'With computer chips!'],
    ['Why can\'t you trust stairs?', 'They\'re always up to something!'],
    ['What do you call a bear with no teeth?', 'A gummy bear!']
  ];
  let lastJoke = -1;
  async function joke() {
    stopAll(); const t = token; busy = true;
    document.querySelector('[data-a="joke"]').classList.add('on');
    let i; do { i = Math.floor(Math.random() * JOKES.length); } while (i === lastJoke);
    lastJoke = i;
    const [q, a] = JOKES[i];
    mode('talk'); caption(q); addMsg('k', q);
    await say(q, {}, t); if (!alive(t)) return;
    mode(); await sleep(900); if (!alive(t)) return;
    mode('laugh'); caption(a); addMsg('k', a);
    const laugh = [523, 659, 523, 659, 784, 659];
    laugh.forEach((f, k) => tone(f, k * 0.12, 0.1, 'square', 0.07));
    for (let k = 0; k < 3; k++) setTimeout(() => alive(t) && floatNote('😂'), k * 400);
    await say(a + ' Ha ha ha!', { pitch: 1.9, rate: 1.1 }, t); if (!alive(t)) return;
    await sleep(900); stopAll();
  }

  async function breathe() {
    stopAll(); const t = token; busy = true;
    document.querySelector('[data-a="breathe"]').classList.add('on');
    mode('breathe');
    addMsg('k', "Let's breathe together. Breathe in through your nose, hold, then out slowly. Three rounds.");
    await say("Let's breathe together. Get comfortable.", { pitch: 1.5, rate: 0.9 }, t);
    for (let r = 1; r <= 3; r++) {
      if (!alive(t)) return;
      caption('Breathe in… 🌬️', 4200); tone(note(0), 0, 3.6, 'sine', 0.06);
      await say('Breathe in', { pitch: 1.4, rate: 0.7 }, t); await sleep(2600); if (!alive(t)) return;
      caption('Hold… ✨', 2200);
      await sleep(2000); if (!alive(t)) return;
      caption('And slowly out… 🍃', 6000); tone(note(-5), 0, 5.4, 'sine', 0.06);
      await say('And slowly out', { pitch: 1.4, rate: 0.6 }, t); await sleep(4200);
    }
    if (!alive(t)) return;
    mode('laugh'); caption('Nicely done. 💜', 3000);
    addMsg('k', 'Nicely done. How do you feel now? You can tell me.');
    await say('Nicely done. How do you feel now?', { pitch: 1.6, rate: 0.95 }, t);
    await sleep(600); stopAll();
  }

  // ---------------------------------------------------------------- talking
  const history = [];
  const FALLBACK = {
    sad: ["I'm sorry it's a heavy day. You don't have to fix everything right now. Want to tell me a little about it?", "I'm here with you. Sometimes a small break, some water and a slow breath can help a tiny bit."],
    stressed: ["That sounds like a lot. Let's go one small step at a time. Want to breathe together for a minute?", "Stress piles up fast. What's the one thing that matters most right now?"],
    _default: ["I'm listening. Tell me a bit more?", "Thanks for telling me. How is that sitting with you?"]
  };
  async function talkTo(text, kind) {
    if (!text) return;
    stopAll(); const t = token;
    addMsg('u', text);
    const typing = addMsg('k', '…');
    mode('talk');
    let reply = '', crisis = false;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-8), live: null })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'failed');
      reply = data.reply; crisis = !!data.crisis;
    } catch (_) {
      reply = pick(FALLBACK[kind] || FALLBACK._default);
    }
    typing.remove();
    if (!alive(t)) return;
    history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    addMsg('k', reply, crisis);
    caption(reply.split('\n')[0].slice(0, 160), 6000);
    mode(crisis || kind === 'sad' ? 'sad' : 'talk');
    if (crisis) root.classList.add('sad');
    root.classList.add('talk');
    await say(reply.split('\n')[0], { pitch: crisis ? 1.3 : 1.55, rate: crisis ? 0.85 : 0.98 }, t);
    if (!alive(t)) return;
    if (kind === 'sad' || kind === 'stressed') root.classList.remove('talk'); else mode();
    // a gentle offer after comforting, never forced, never after a crisis message
    if (!crisis && (kind === 'sad' || kind === 'stressed')) {
      const offer = kind === 'sad' ? 'Want me to sing you a little song, or tell a joke?' : 'Want to breathe together, or hear a joke?';
      addMsg('k', offer);
    }
    setTimeout(() => { if (alive(t)) mode(); }, 1200);
  }

  function moodTap(m) {
    if (m === 'sad') {
      stopAll(); const t = token; mode('sad');
      const l = "I'm really sorry you feel sad. I'm right here. I'll sing you a little song.";
      addMsg('u', 'I feel sad'); addMsg('k', l); caption(l, 5000);
      say(l, { pitch: 1.5, rate: 0.9 }, t).then(() => alive(t) && sing());
    } else if (m === 'stressed') {
      stopAll(); const t = token; mode('sad');
      const l = "Stress is heavy. Let's slow everything down together.";
      addMsg('u', "I'm stressed"); addMsg('k', l); caption(l, 4000);
      say(l, { pitch: 1.5, rate: 0.9 }, t).then(() => alive(t) && breathe());
    } else if (m === 'bored') {
      addMsg('u', 'Cheer me up'); (Math.random() < 0.5 ? joke : dance)();
    } else if (m === 'happy') {
      stopAll(); const t = token; mode('laugh');
      const l = "Yay! I love that! Let's celebrate!";
      addMsg('u', "I'm happy"); addMsg('k', l); caption(l, 3000);
      say(l, { pitch: 1.9, rate: 1.1 }, t).then(() => alive(t) && dance());
    }
  }

  // ---------------------------------------------------------------- UI wiring
  function openPanel(open) {
    panel.hidden = !open;
    if (open) {
      root.classList.remove('hidden'); prefs.hidden = false; savePrefs();
      cap.classList.remove('on');
      if (!greeted) {
        greeted = true;
        addMsg('k', "Beep boop! I'm Kinesin, your tiny robot friend. 🤖 I can chat, sing, dance, tell jokes, or breathe with you. How are you feeling?");
        try { audio(); } catch (_) {}
        mode('laugh'); setTimeout(() => { if (!busy) mode(); }, 1500);
        say("Hi! I'm Kinesin. How are you feeling today?", {}, token);
      }
    }
  }
  $('kin-bot').addEventListener('click', () => {
    if (root.classList.contains('hidden')) { openPanel(true); return; }
    openPanel(panel.hidden);
  });
  $('kin-x').addEventListener('click', () => { stopAll(); openPanel(false); });
  $('kin-min').addEventListener('click', () => { stopAll(); openPanel(false); root.classList.add('hidden'); prefs.hidden = true; savePrefs(); });
  $('kin-mute').addEventListener('click', () => {
    prefs.muted = !prefs.muted; savePrefs();
    $('kin-mute').textContent = prefs.muted ? '🔇' : '🔊';
    if (prefs.muted) { try { synth && synth.cancel(); } catch (_) {} }
  });
  $('kin-mute').textContent = prefs.muted ? '🔇' : '🔊';
  $('kin-moods').addEventListener('click', (e) => { const c = e.target.closest('.kin-chip'); if (c) { audio(); moodTap(c.dataset.m); } });
  panel.querySelector('.kin-acts').addEventListener('click', (e) => {
    const b = e.target.closest('.kin-act'); if (!b) return;
    audio();
    const a = b.dataset.a;
    if (b.classList.contains('on')) { stopAll(); return; }
    ({ sing, dance, joke, breathe })[a]();
  });
  $('kin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim(); if (!v) return;
    input.value = ''; audio();
    const kind = /\b(sad|cry|crying|lonely|down|hopeless|depress)/i.test(v) ? 'sad' : /\b(stress|anxious|anxiety|worried|panic|overwhelm|pressure)/i.test(v) ? 'stressed' : '';
    talkTo(v, kind);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { stopAll(); openPanel(false); } });
  window.addEventListener('pagehide', () => { try { synth && synth.cancel(); } catch (_) {} });

  // optional: talk by voice (browser speech recognition, where available)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const mic = $('kin-mic'); mic.hidden = false;
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { try { rec.stop(); } catch (_) {} return; }
      stopAll(); audio();
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      mic.classList.add('rec');
      rec.onresult = (ev) => { const v = ev.results[0][0].transcript; if (v) { input.value = ''; talkTo(v, /sad|lonely|cry/i.test(v) ? 'sad' : /stress|anxi|worr/i.test(v) ? 'stressed' : ''); } };
      rec.onend = rec.onerror = () => { mic.classList.remove('rec'); rec = null; };
      try { rec.start(); } catch (_) { mic.classList.remove('rec'); rec = null; }
    });
  }

  // ---------------------------------------------------------------- public API
  // Scan pages already call MoodAgent.setLive({face, feeling}); Kinesin listens in
  // and quietly offers comfort (text only, no sound) when the face reads low.
  let nudged = false;
  function react(face, feeling) {
    if (nudged || !panel.hidden) return;
    const lowFace = /sad|angry|fear|disgust/i.test(face || '');
    const lowFeel = /sad|stress|anx|angry|tired/i.test(feeling || '');
    if (!lowFace && !lowFeel) return;
    nudged = true;
    mode('sad'); caption("Hey… you look a little down. Want a song, a joke, or just a chat? Tap me. 💜", 9000);
    setTimeout(() => { if (!busy && panel.hidden) mode(); }, 9000);
  }
  window.Kinesin = { react, sing, dance, joke, breathe, stop: stopAll, open: () => openPanel(true) };

  const hook = () => {
    const ma = window.MoodAgent;
    if (!ma || ma.__kin || typeof ma.setLive !== 'function') return false;
    const orig = ma.setLive.bind(ma);
    ma.setLive = (o) => { orig(o); if (o) react(o.face, o.feeling); };
    ma.__kin = true; return true;
  };
  if (!hook()) { let n = 0; const iv = setInterval(() => { if (hook() || ++n > 20) clearInterval(iv); }, 500); }

  // first-time hello bubble (text only; sound starts only after a tap)
  if (!prefs.hidden && !sessionStorage.getItem('mien-kin-hi')) {
    try { sessionStorage.setItem('mien-kin-hi', '1'); } catch (_) {}
    setTimeout(() => { if (panel.hidden) caption("Hi! I'm Kinesin 🤖 Tap me if you want to talk, hear a song or a joke.", 6000); }, 1800);
  }
})();
