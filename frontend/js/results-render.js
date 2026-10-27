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
    ['Estimated age', `~${Math.round(r.age)}`],
    ['Gender estimate', `${capWord(r.gender)} (${Math.round((r.genderProbability || 0) * 100)}%)`],
    ['Dominant expression', emotionBadge(r.dominantExpression)],
    ['Face shape', `${r.faceShape || '—'}${r.faceShapeConfidence != null ? ` (${Math.round(r.faceShapeConfidence)}% match)` : ''}`],
    ['Symmetry score', `${r.symmetryScore != null ? Math.round(r.symmetryScore) : '—'}/100`]
  ];

  gridEl.innerHTML = cards
    .map(
      ([label, value]) => `
      <div class="card">
        <div class="muted" style="font-size:12.5px; margin-bottom:6px;">${label}</div>
        <div style="font-family:var(--font-display); font-size:20px;">${value}</div>
      </div>`
    )
    .join('');

  if (!expressionsListEl) return;

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
            <div style="height:100%; width:${pct}%; background:${color};"></div>
          </div>
        </div>`;
      })
      .join('');
}
