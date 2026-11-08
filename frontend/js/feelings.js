// Shared helpers for Face vs Feeling, Mood Story and the Bad Day Kit.
// Pure display / maths on scans that were already saved — no model code here.

const FEELINGS = [
  { id: 'happy',    emoji: '😄', label: 'Happy',    face: ['happy', 'funny', 'excited'] },
  { id: 'okay',     emoji: '🙂', label: 'Okay',     face: ['neutral', 'happy'] },
  { id: 'tired',    emoji: '😴', label: 'Tired',    face: ['neutral', 'sad'] },
  { id: 'sad',      emoji: '😢', label: 'Sad',      face: ['sad'] },
  { id: 'stressed', emoji: '😣', label: 'Stressed', face: ['fearful', 'angry', 'sad'] },
  { id: 'angry',    emoji: '😠', label: 'Angry',    face: ['angry', 'disgusted', 'contempt'] },
  { id: 'anxious',  emoji: '😰', label: 'Anxious',  face: ['fearful', 'sad'] },
  { id: 'excited',  emoji: '🤩', label: 'Excited',  face: ['excited', 'happy', 'surprised', 'funny'] }
];

function feelingOf(id) {
  return FEELINGS.find((f) => f.id === id) || null;
}

function feelingBadge(id) {
  const f = feelingOf(id);
  if (!f) return '';
  return `<span class="emo-badge feel-badge">${f.emoji} ${f.label}</span>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseExpr(scan) {
  try { return JSON.parse(scan.expressions_json || '{}'); } catch (_) { return {}; }
}

// Group-photo scans contain other people's faces, so they never count towards
// personal stats (journal insights, mood story, bad day kit).
function ownScans(scans) {
  return (scans || []).filter((s) => !/^Group photo/i.test(s.label || ''));
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

// Returns { labeled, needed, lines[] } — lines are plain-English insight sentences.
function faceVsFeelingInsights(scans) {
  const mine = ownScans(scans);
  const labeled = mine.filter((s) => feelingOf(s.self_feeling));
  const NEEDED = 5;
  const out = { labeled: labeled.length, needed: NEEDED, lines: [], matchRate: null };
  if (labeled.length < NEEDED) return out;

  // How often did the camera's dominant expression fit what you said?
  const matched = labeled.filter((s) => feelingOf(s.self_feeling).face.includes(s.dominant_expression)).length;
  out.matchRate = { matched, total: labeled.length };

  const eyeAll = avg(mine.filter((s) => s.eye_open != null).map((s) => s.eye_open));
  const neutralAll = avg(mine.map((s) => parseExpr(s).neutral).filter((v) => typeof v === 'number'));

  FEELINGS.forEach((f) => {
    const group = labeled.filter((s) => s.self_feeling === f.id);
    if (group.length < 3) return;
    const name = f.label.toLowerCase();

    const eyeG = avg(group.filter((s) => s.eye_open != null).map((s) => s.eye_open));
    if (eyeAll && eyeG != null) {
      const diff = (eyeG - eyeAll) / eyeAll;
      if (diff <= -0.08) out.lines.push({ emoji: f.emoji, text: `When you say “${name}”, your eyes are about ${Math.round(-diff * 100)}% more closed than your usual.` });
      else if (diff >= 0.08) out.lines.push({ emoji: f.emoji, text: `When you say “${name}”, your eyes are about ${Math.round(diff * 100)}% wider than your usual.` });
    }

    const neutralG = avg(group.map((s) => parseExpr(s).neutral).filter((v) => typeof v === 'number'));
    if (neutralAll != null && neutralG != null && neutralG - neutralAll >= 0.15) {
      out.lines.push({ emoji: f.emoji, text: `Whenever you say “${name}”, your face reads more neutral (${Math.round(neutralG * 100)}% vs your usual ${Math.round(neutralAll * 100)}%).` });
    }

    const happyAll = avg(mine.map((s) => parseExpr(s).happy).filter((v) => typeof v === 'number'));
    const happyG = avg(group.map((s) => parseExpr(s).happy).filter((v) => typeof v === 'number'));
    if (happyAll != null && happyG != null && f.id !== 'happy' && f.id !== 'excited' && happyG - happyAll >= 0.2) {
      out.lines.push({ emoji: f.emoji, text: `Even when you say “${name}”, your face still smiles more than usual (${Math.round(happyG * 100)}% happy).` });
    }
  });

  // Said good, face leaned somewhere else
  const mismatch = labeled.filter((s) => ['happy', 'okay', 'excited'].includes(s.self_feeling) && ['sad', 'fearful', 'angry'].includes(s.dominant_expression)).length;
  if (mismatch >= 2) out.lines.push({ emoji: '🪞', text: `${mismatch} times you said you felt good while your face leaned sad, fearful or angry. Worth a moment of noticing.` });

  return out;
}

// ---- date helpers used by story + journal ----
const _pad = (n) => String(n).padStart(2, '0');
function dayKey(d) { return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
function dayNumber(k) { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
