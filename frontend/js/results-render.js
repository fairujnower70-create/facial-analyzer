// Shared result-rendering helpers. These only format and display data that
// analyze.js (or a saved history record) already computed — none of the
// analysis/calculation logic lives here or is touched by it.

function capWord(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function emotionColor(name) {
  return (typeof EXPRESSION_COLORS !== 'undefined' && EXPRESSION_COLORS[name]) || '#94a3b8';
}

function emotionBadge(name, extra) {
  const color = emotionColor(name);
  return `<span class="emo-badge" style="color:${color}; background:${color}1a; border-color:${color}40;">${capWord(name)}${extra ? ` · ${extra}` : ''}</span>`;
}

// Renders the metric cards + expression breakdown bars for one analysis
// result into the given container elements.
function renderAnalysisCard(gridEl, expressionsListEl, r) {
  const cards = [
    ['Estimated age', `~<span data-count="${Math.round(r.age)}">${Math.round(r.age)}</span>`],
    ['Gender estimate', `${capWord(r.gender)} (<span data-count="${Math.round((r.genderProbability || 0) * 100)}">${Math.round((r.genderProbability || 0) * 100)}</span>%)`],
    ['Dominant expression', emotionBadge(r.dominantExpression)],
    ['Face shape', r.faceShapeScores && r.faceShape in r.faceShapeScores ? `${r.faceShape} (<span data-count="${r.faceShapeScores[r.faceShape]}">${r.faceShapeScores[r.faceShape]}</span>%)` : `${r.faceShape || '—'}${r.faceShapeConfidence != null ? ` (<span data-count="${Math.round(r.faceShapeConfidence)}">${Math.round(r.faceShapeConfidence)}</span>% match)` : ''}`],
    ['Symmetry score', r.symmetryScore != null ? `<span data-count="${Math.round(r.symmetryScore)}">${Math.round(r.symmetryScore)}</span>/100` : '—/100']
  ];

  setMood(r.dominantExpression);

  gridEl.innerHTML = cards
    .map(
      ([label, value]) => `
      <div class="card result-card">
        <div class="muted" style="font-size:12.5px; margin-bottom:6px;">${label}</div>
        <div style="font-family:var(--font-display); font-size:20px;">${value}</div>
      </div>`
    )
    .join('');

  if (!expressionsListEl) {
    animateResults(gridEl);
    return;
  }

  const expressions = r.expressions || {};
  const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);

  expressionsListEl.innerHTML =
    `<div class="muted" style="font-size:13px; margin-bottom:10px;">Expression breakdown</div>` +
    sorted
      .map(([name, val]) => {
        const color = emotionColor(name);
        const pct = Math.round(val * 100);
        return `
        <div style="margin-bottom:8px;">
          <div class="row" style="justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>${capWord(name)}</span><span class="muted">${pct}%</span>
          </div>
          <div style="height:6px; border-radius:4px; background:var(--bg-input); overflow:hidden;">
            <div class="bar-fill" data-w="${pct}" style="height:100%; width:0; background:${color};"></div>
          </div>
        </div>`;
      })
      .join('');

  // Face-shape breakdown: a percentage for every shape.
  if (r.faceShapeScores) {
    const shapes = Object.entries(r.faceShapeScores).sort((a, b) => b[1] - a[1]);
    expressionsListEl.innerHTML +=
      `<div class="muted" style="font-size:13px; margin:18px 0 10px;">Face shape breakdown</div>` +
      shapes
        .map(
          ([name, pct], i) => `
        <div style="margin-bottom:8px;">
          <div class="row" style="justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span${i === 0 ? ' style="font-weight:600;"' : ''}>${name}</span><span class="muted">${pct}%</span>
          </div>
          <div style="height:6px; border-radius:4px; background:var(--bg-input); overflow:hidden;">
            <div class="bar-fill" data-w="${pct}" style="height:100%; width:0; background:var(--accent, #8b5cf6);"></div>
          </div>
        </div>`
        )
        .join('');
  }

  animateResults(gridEl);
  animateResults(expressionsListEl);
}

// ---------- motion helpers (display only) ----------

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Counts [data-count] numbers up from 0 and grows .bar-fill bars to data-w%.
function animateResults(root) {
  if (!root) return;
  const reduce = prefersReducedMotion();

  root.querySelectorAll('.bar-fill').forEach((bar, i) => {
    const w = bar.getAttribute('data-w') + '%';
    if (reduce) {
      bar.style.width = w;
    } else {
      bar.style.transitionDelay = `${i * 70}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = w)));
    }
  });

  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.getAttribute('data-count'));
    if (reduce || !isFinite(target)) return;
    const duration = 900;
    const start = performance.now();
    el.textContent = '0';
    (function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  });
}

// Tints the page background with the dominant emotion's colour.
function setMood(name) {
  let glow = document.querySelector('.mood-glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.className = 'mood-glow';
    document.body.appendChild(glow);
  }
  if (name) {
    glow.style.setProperty('--mood', emotionColor(name));
    glow.classList.add('on');
  } else {
    glow.classList.remove('on');
  }
}
