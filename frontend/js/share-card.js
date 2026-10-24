// Builds a shareable result image (canvas -> PNG) and shares or downloads it.
// Display only: it just draws numbers that were already computed.

function _loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// result: { age, gender, dominantExpression, faceShape, symmetryScore, expressions }
async function buildShareCard(result, photoSrc, personName) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const color = emotionColor(result.dominantExpression);

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.75, 120, 20, W * 0.75, 120, 700);
  glow.addColorStop(0, color + '66'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // brand ring + name
  const ring = ctx.createLinearGradient(60, 60, 130, 130);
  ring.addColorStop(0, '#22d3ee'); ring.addColorStop(0.5, '#8b5cf6'); ring.addColorStop(1, '#ec4899');
  ctx.strokeStyle = ring; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(96, 96, 32, 0.3, Math.PI * 2 - 0.3); ctx.stroke();
  ctx.fillStyle = '#f8fafc'; ctx.font = '700 46px "Space Grotesk", Inter, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('Mien', 150, 96);

  // photo
  const img = await _loadImage(photoSrc);
  const px = 90, py = 190, pw = W - 180, ph = 560;
  ctx.save(); _roundRect(ctx, px, py, pw, ph, 44); ctx.clip();
  if (img) {
    const s = Math.max(pw / img.width, ph / img.height);
    ctx.drawImage(img, px + (pw - img.width * s) / 2, py + (ph - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = '#1e293b'; ctx.fillRect(px, py, pw, ph);
  }
  ctx.restore();
  ctx.strokeStyle = color; ctx.lineWidth = 5; _roundRect(ctx, px, py, pw, ph, 44); ctx.stroke();

  // emotion chip
  const label = capWord(result.dominantExpression || 'neutral');
  ctx.font = '700 40px Inter, sans-serif';
  const cw = ctx.measureText(label).width + 80;
  ctx.fillStyle = '#0f172aee'; _roundRect(ctx, px + 30, py + ph - 100, cw, 70, 35); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px + 66, py + ph - 65, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f8fafc'; ctx.textBaseline = 'middle'; ctx.fillText(label, px + 90, py + ph - 63);

  // stats
  const stats = [
    ['AGE', result.age != null ? `~${Math.round(result.age)}` : '—'],
    ['SYMMETRY', result.symmetryScore != null ? `${Math.round(result.symmetryScore)}/100` : '—'],
    ['FACE SHAPE', result.faceShape || '—']
  ];
  const colW = (W - 180) / 3;
  stats.forEach(([k, v], i) => {
    const x = 90 + i * colW;
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 26px Inter, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(k, x, 835);
    ctx.fillStyle = '#f8fafc'; ctx.font = '700 64px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(v, x, 910);
  });

  // top expressions bars
  const exps = Object.entries(result.expressions || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  exps.forEach(([name, val], i) => {
    const y = 990 + i * 70;
    ctx.fillStyle = '#cbd5e1'; ctx.font = '500 28px Inter, sans-serif'; ctx.fillText(capWord(name), 90, y);
    ctx.fillStyle = '#1e293b'; _roundRect(ctx, 330, y - 18, 520, 22, 11); ctx.fill();
    ctx.fillStyle = emotionColor(name); _roundRect(ctx, 330, y - 18, Math.max(22, 520 * val), 22, 11); ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.fillText(`${Math.round(val * 100)}%`, 880, y);
  });

  // footer
  ctx.fillStyle = '#94a3b8'; ctx.font = '500 26px Inter, sans-serif';
  ctx.fillText(personName ? `${personName} · analysed with Mien` : 'Analysed with Mien', 90, 1250);
  ctx.fillStyle = '#64748b'; ctx.font = '400 22px Inter, sans-serif';
  ctx.fillText('Estimates only — not a medical or identity tool', 90, 1292);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

async function shareResultCard(result, photoSrc, personName) {
  const blob = await buildShareCard(result, photoSrc, personName);
  if (!blob) throw new Error('Could not create the image');
  const file = new File([blob], 'mien-result.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Mien result', text: 'My face analysis from Mien' });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mien-result.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
