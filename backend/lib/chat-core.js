// Mood Buddy: the logic behind /api/chat. Kept free of express so it can be
// tested on its own. Nothing the person types is stored: only a per-day
// message counter is kept (to protect the free API quota).

const FEELINGS = ['happy', 'okay', 'tired', 'sad', 'stressed', 'angry', 'anxious', 'excited'];
const FACES = ['happy', 'sad', 'angry', 'surprised', 'neutral', 'fearful', 'disgusted', 'funny', 'excited', 'shy', 'contempt'];

const USER_DAILY = Number(process.env.CHAT_DAILY_LIMIT) || 20;
const GLOBAL_DAILY = Number(process.env.CHAT_GLOBAL_DAILY_LIMIT) || 800;

// Keyword safety net. It is NOT complete (the model prompt also handles this),
// but these phrases skip the model entirely and get a fixed, careful reply.
const CRISIS_LATIN = /(suicid|kill (my|him|her)self|end (my life|it all)|want to die|wanna die|don'?t want to (live|be alive)|self[- ]?harm|hurt myself|cut myself|better off dead|morte chai|more jete chai|nijeke shesh|atmohotta|atohotta|ator hotya|bachte chai na|bachte ichchha kore na)/i;
const CRISIS_BANGLA = /(আত্মহত্যা|মরে যেতে চাই|মরতে চাই|বাঁচতে চাই না|নিজেকে শেষ)/;

const CRISIS_REPLY =
  "I'm really glad you told me. What you're feeling matters, and you don't have to carry it alone. " +
  "Please reach out to someone you trust right now, or contact your local emergency number or a crisis helpline. " +
  "If you think you might act on these thoughts, please move to a safe place near other people. " +
  "I'm an AI, so I can't be the support you need in this moment.\n\n" +
  "Tumi eka na. Ekhon-i kono trusted manush-er shathe kotha bolo, ba tomar desher emergency number ba helpline-e jogajog koro.";

const LIMITED_REPLY =
  "We've talked a lot today, and I'd like to leave it there for now. Try the breathing exercise in the Bad Day Kit, or message someone you trust. I'll be here tomorrow.";

const FALLBACKS = {
  sad: ["That sounds heavy. You don't have to fix it right now. Want to tell me a little about what made today feel this way?", "I'm sorry it's a hard day. Sometimes naming it helps a bit. What's weighing on you most?"],
  tired: ["Sounds like you're running low. Have you had water and a short break? Even five quiet minutes can help.", "Tired days are real. What's one thing you could take off your plate today?"],
  stressed: ["That's a lot to hold. Try one slow breath out, longer than the breath in. What's the biggest thing on your mind?", "Stress piles up fast. What's one small thing you can do next, just one?"],
  anxious: ["Anxious thoughts get loud. You could try the 1-minute breathing in the Bad Day Kit. What's the worry saying right now?", "I hear you. Let's slow down together. What are you most worried about?"],
  angry: ["It makes sense to feel that way if something felt unfair. What happened?", "Anger usually points at something that matters. What's behind it today?"],
  happy: ["That's lovely to hear! What made today good? It's worth noting down in your journal.", "Nice! What's one thing that went well today?"],
  excited: ["I love that energy! What are you looking forward to?"],
  okay: ["Okay is a perfectly fine place to be. Anything on your mind today, big or small?"],
  _default: ["I'm here. How are you feeling right now, in your own words?", "Tell me a bit about your day. I'm listening."]
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fallbackReply(live, recent) {
  const f = (live && live.feeling) || (recent[0] && recent[0].self_feeling) || null;
  return pick(FALLBACKS[f] || FALLBACKS._default);
}

const SYSTEM_PROMPT = [
  'You are Mood Buddy, a warm, brief companion inside the Mien app. Mien reads facial expressions with a camera model and lets people record how they feel.',
  'You are not a therapist, doctor or crisis service. Never diagnose, never give medical advice.',
  'Style: 2 to 4 short sentences, plain words, gentle and curious. Ask at most one question. Reply in the same language and script the person writes in (English, Bangla, or Banglish).',
  'The context lines are rough estimates from a camera model and can be wrong. Treat what the person says as the truth. Do not just agree or flatter; be honest and kind.',
  'Encourage real-world support (friends, family) and small actions (water, a walk, the 1-minute breathing in the Bad Day Kit page, a note in the Journal) when it fits, without pushing.',
  'If the person mentions harming themselves or being in danger, calmly urge them to contact someone they trust or local emergency services right now.',
  'Never claim to be human. Never say you will always be there. Do not ask for names, passwords or ID numbers.'
].join(' ');

function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
}

function cleanLive(l) {
  const out = {};
  if (l && FACES.includes(l.face)) out.face = l.face;
  if (l && FEELINGS.includes(l.feeling)) out.feeling = l.feeling;
  return out;
}

async function callModel(messages) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'openai/gpt-oss-120b';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.7 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return typeof text === 'string' && text.trim() ? text.trim().slice(0, 1200) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function createChat(db) {
  async function reply(userId, body) {
    const message = body && typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    if (!message) return { status: 400, error: 'Say something and I will listen.' };

    if (CRISIS_LATIN.test(message) || CRISIS_BANGLA.test(message)) {
      return { status: 200, reply: CRISIS_REPLY, crisis: true };
    }

    const live = cleanLive(body.live);
    const history = cleanHistory(body.history);

    let recent = [];
    try {
      recent = (await db.query(
        `SELECT dominant_expression, self_feeling FROM scans
         WHERE user_id = $1 AND (label IS NULL OR label NOT LIKE 'Group photo%')
         ORDER BY created_at DESC LIMIT 5`, [userId])).rows;
    } catch (_) {}

    // Usage guard: per person, and across everyone (free API quota).
    let allowed = true;
    try {
      const mine = await db.query(
        `INSERT INTO chat_usage (user_id, day, count) VALUES ($1, current_date, 1)
         ON CONFLICT (user_id, day) DO UPDATE SET count = chat_usage.count + 1 RETURNING count`, [userId]);
      if (mine.rows[0].count > USER_DAILY) return { status: 200, reply: LIMITED_REPLY, limited: true };
      const all = await db.query('SELECT COALESCE(SUM(count), 0)::int AS n FROM chat_usage WHERE day = current_date');
      if (all.rows[0].n > GLOBAL_DAILY) allowed = false;
    } catch (_) {}

    let ctx = 'Context (rough estimates, may be wrong):';
    if (live.face) ctx += ` the latest scan reads "${live.face}".`;
    if (live.feeling) ctx += ` The person said they feel "${live.feeling}".`;
    const past = recent.map((r) => r.self_feeling).filter(Boolean);
    if (past.length) ctx += ` Recent self-reported feelings (newest first): ${past.join(', ')}.`;
    if (ctx.endsWith(':')) ctx += ' none yet.';

    const text = allowed
      ? await callModel([{ role: 'system', content: `${SYSTEM_PROMPT}\n${ctx}` }, ...history, { role: 'user', content: message }])
      : null;

    if (!text) return { status: 200, reply: fallbackReply(live, recent), fallback: true };
    return { status: 200, reply: text };
  }
  return { reply };
}

module.exports = { createChat, CRISIS_LATIN, CRISIS_BANGLA };
