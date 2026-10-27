// Shared computer-vision helpers for Mien (loaded before analyze.js).
//
//   * model loading   — local /models first, CDN as a fallback
//   * symmetry        — landmark repair layer + a clean SymmetryError
//   * face-shape %    — softmax over the archetype distances
//   * head pose       — yaw / pitch / roll from 6 landmarks (LM solver)
//   * image quality   — brightness / contrast / sharpness of the face crop
//   * extra moods     — funny, excited, shy, contempt (derived, see notes)
//
// Everything that does not need the DOM is plain functions so it can be unit
// tested in Node (see the module.exports line at the bottom).
(function (root) {
  'use strict';

  const CFG = {
    MODEL_BASES: ['/models', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model'],

    // ---- adaptive validation gateway (tune here) ----
    MAX_ANGLE: 15, // degrees from centre allowed for yaw / pitch / roll
    MIN_BRIGHTNESS: 55, // mean luma (0-255) of the face crop
    MIN_CONTRAST: 18, // std-dev of luma; very flat = washed out / too dark
    MIN_SHARPNESS: 45, // Laplacian variance of the 96x96 face crop
    CENTER_TOLERANCE: 0.2, // face centre may be this far (fraction of frame) from the middle
    MIN_FACE_FRACTION: 0.2, // face box width / frame width
    MAX_SPEED: 0.45, // face-box widths per second; above this = not steady
    UNLOCK_AFTER: 3, // consecutive good frames needed to unlock capture

    // ---- symmetry repair ----
    MAX_REPAIRED_POINTS: 10,
    MIN_SYMMETRY_PAIRS: 3,
    SHAPE_TAU: 0.05, // softmax temperature for face-shape percentages
    DERIVED_DISCOUNT: 0.85 // derived moods must beat native ones by this margin
  };

  // ------------------------------------------------------------------ utils
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x, a, b) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const isPt = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ------------------------------------------------------------ model loading
  let activeBase = null;
  let modelSource = null;

  async function loadNets(nets) {
    const bases = activeBase ? [activeBase, ...CFG.MODEL_BASES.filter((b) => b !== activeBase)] : CFG.MODEL_BASES;
    let firstError = null;
    for (const base of bases) {
      try {
        await Promise.all(nets.filter((n) => !n.isLoaded).map((n) => n.loadFromUri(base)));
        activeBase = base;
        modelSource = base.charAt(0) === '/' ? 'local' : 'cdn';
        return base;
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
    throw firstError || new Error('models could not be loaded');
  }

  // ---------------------------------------------------------- symmetry layer
  class SymmetryError extends Error {
    constructor(token, detail) {
      super(`Symmetry could not be measured (${token})`);
      this.name = 'SymmetryError';
      this.token = token; // consumed by results-render.js -> retake prompt
      this.detail = detail || null;
    }
  }

  // Contours, used for neighbour interpolation (loop = closed shape).
  const GROUPS = [
    { from: 0, to: 16, loop: false }, // jaw
    { from: 17, to: 21, loop: false }, // right brow (image-left)
    { from: 22, to: 26, loop: false }, // left brow
    { from: 27, to: 30, loop: false }, // nose bridge
    { from: 31, to: 35, loop: false }, // nose base
    { from: 36, to: 41, loop: true }, // eye
    { from: 42, to: 47, loop: true }, // eye
    { from: 48, to: 59, loop: true }, // outer lip
    { from: 60, to: 67, loop: true } // inner lip
  ];

  // Left <-> right partner of every landmark that has one (68-point scheme).
  const MIRROR = (() => {
    const m = {};
    const pair = (a, b) => {
      m[a] = b;
      m[b] = a;
    };
    for (let i = 0; i < 8; i++) pair(i, 16 - i); // jaw
    for (let k = 0; k < 5; k++) pair(17 + k, 26 - k); // brows
    pair(31, 35); pair(32, 34); // nostrils
    pair(36, 45); pair(37, 44); pair(38, 43); pair(39, 42); pair(40, 47); pair(41, 46); // eyes
    pair(48, 54); pair(49, 53); pair(50, 52); pair(59, 55); pair(58, 56); // outer lip
    pair(60, 64); pair(61, 63); pair(67, 65); // inner lip
    return m;
  })();
  const MIDLINE = [27, 28, 29, 30, 33, 51, 62, 66, 57, 8];

  function groupOf(i) {
    return GROUPS.find((g) => i >= g.from && i <= g.to);
  }

  // Fit the face's vertical axis through the valid midline landmarks
  // (principal direction of those points).
  function fitMidline(pts, bad) {
    const mp = MIDLINE.filter((i) => !bad.has(i)).map((i) => pts[i]);
    if (mp.length < 3) return null;
    const cx = mp.reduce((s, p) => s + p.x, 0) / mp.length;
    const cy = mp.reduce((s, p) => s + p.y, 0) / mp.length;
    let sxx = 0, syy = 0, sxy = 0;
    mp.forEach((p) => {
      sxx += (p.x - cx) ** 2;
      syy += (p.y - cy) ** 2;
      sxy += (p.x - cx) * (p.y - cy);
    });
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { cx, cy, dx: Math.cos(ang), dy: Math.sin(ang) };
  }
  function reflect(p, axis) {
    const vx = p.x - axis.cx, vy = p.y - axis.cy;
    const t = vx * axis.dx + vy * axis.dy;
    const px = axis.cx + t * axis.dx, py = axis.cy + t * axis.dy;
    return { x: 2 * px - p.x, y: 2 * py - p.y };
  }

  // Interpolate landmark i from the nearest valid neighbours on its contour.
  function interpolate(pts, i, bad) {
    const g = groupOf(i);
    if (!g) return null;
    const n = g.to - g.from + 1;
    const find = (dir) => {
      for (let step = 1; step < n; step++) {
        let j = i + dir * step;
        if (g.loop) j = g.from + ((((j - g.from) % n) + n) % n);
        else if (j < g.from || j > g.to) return null;
        if (!bad.has(j)) return { j, step };
      }
      return null;
    };
    const prev = find(-1);
    const next = find(1);
    if (prev && next && prev.j !== next.j) {
      const t = prev.step / (prev.step + next.step);
      const a = pts[prev.j], b = pts[next.j];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    const one = prev || next;
    if (!one) return null;
    // One-sided: extrapolate along the two nearest valid points if there are
    // two, otherwise copy the nearest (a coarse but finite estimate).
    const dir = prev ? -1 : 1;
    const j2 = one.j + dir * -1;
    if (j2 >= g.from && j2 <= g.to && !bad.has(j2) && j2 !== i) {
      const a = pts[one.j], b = pts[j2];
      return { x: a.x + (a.x - b.x) * one.step, y: a.y + (a.y - b.y) * one.step };
    }
    return { x: pts[one.j].x, y: pts[one.j].y };
  }

  // Returns { points, repaired:[idx], mirrored:Set(idx) } or throws SymmetryError.
  function repairLandmarks(raw) {
    if (!raw || raw.length !== 68) throw new SymmetryError('SYM_LANDMARKS_MISSING', { count: raw ? raw.length : 0 });
    const pts = raw.map((p) => (isPt(p) ? { x: p.x, y: p.y } : null));
    const bad = new Set();
    pts.forEach((p, i) => { if (!p) bad.add(i); });
    if (bad.size > CFG.MAX_REPAIRED_POINTS) throw new SymmetryError('SYM_LANDMARKS_UNREADABLE', { missing: bad.size });

    const repaired = [];
    const mirrored = new Set();
    if (bad.size) {
      const axis = fitMidline(pts, bad);
      const order = Array.from(bad);
      // 1) mirror vector from the partner landmark (needs the midline)
      order.forEach((i) => {
        const j = MIRROR[i];
        if (axis && j !== undefined && !bad.has(j)) {
          pts[i] = reflect(pts[j], axis);
          mirrored.add(i);
        }
      });
      // 2) neighbour interpolation for everything else (nearest valid first)
      const todo = order.filter((i) => !pts[i]);
      const stillBad = new Set(todo);
      todo.forEach((i) => {
        const p = interpolate(pts, i, stillBad);
        if (!p) throw new SymmetryError('SYM_LANDMARKS_UNREADABLE', { index: i });
        pts[i] = p;
        stillBad.delete(i);
      });
      order.forEach((i) => repaired.push(i));
    }
    for (const p of pts) {
      if (!isPt(p)) throw new SymmetryError('SYM_LANDMARKS_UNREADABLE');
    }
    if (dist(pts[36], pts[45]) < 8 || dist(pts[0], pts[16]) < 12) {
      throw new SymmetryError('SYM_DEGENERATE');
    }
    return { points: pts, repaired, mirrored };
  }

  const SYM_PAIRS = [
    [36, 45], // outer eyes
    [39, 42], // inner eyes
    [31, 35], // nose base
    [48, 54], // mouth corners
    [1, 15] // jaw
  ];

  // Same formula as before (distance of each pair to the nose tip, calibrated
  // against the population baseline) — now computed on repaired landmarks.
  // Pairs that only exist because a point was *mirrored* from its partner
  // would look perfectly symmetric by construction, so they are left out of
  // the average instead of inflating the score.
  function computeSymmetry(rawPoints, baseline) {
    const { points: pts, repaired, mirrored } = repairLandmarks(rawPoints);
    const noseTip = pts[30];
    const usable = SYM_PAIRS.filter(([a, b]) => !mirrored.has(a) && !mirrored.has(b));
    if (usable.length < CFG.MIN_SYMMETRY_PAIRS) throw new SymmetryError('SYM_LANDMARKS_UNREADABLE', { pairs: usable.length });

    let total = 0;
    usable.forEach(([li, ri]) => {
      const l = dist(pts[li], noseTip);
      const r = dist(pts[ri], noseTip);
      const m = Math.max(l, r);
      if (!(m > 0)) throw new SymmetryError('SYM_DEGENERATE');
      total += Math.abs(l - r) / m;
    });
    const avgDiff = total / usable.length;
    const raw = 100 - (avgDiff / baseline) * 15;
    const score = Math.min(100, Math.round(raw));
    // A score of 0 (or NaN) means the landmarks were not describing a real
    // frontal face — never hand that on to history as if it were a result.
    if (!Number.isFinite(score) || score < 1) throw new SymmetryError('SYM_OUT_OF_RANGE', { raw });
    return { score, repairedCount: repaired.length, pairsUsed: usable.length };
  }

  // -------------------------------------------------------- face-shape scores
  function shapeProbabilities(distances, tau) {
    const t = tau || CFG.SHAPE_TAU;
    const names = Object.keys(distances);
    const dmin = Math.min(...names.map((n) => distances[n]));
    const w = names.map((n) => Math.exp(-(distances[n] - dmin) / t));
    const sum = w.reduce((a, b) => a + b, 0);
    const exact = w.map((x) => (x / sum) * 100);
    // largest-remainder rounding so the six numbers add up to exactly 100
    const floors = exact.map(Math.floor);
    let left = 100 - floors.reduce((a, b) => a + b, 0);
    exact
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => {
        if (left > 0) { floors[i] += 1; left--; }
      });
    const out = {};
    names.forEach((n, i) => (out[n] = floors[i]));
    return out;
  }

  // -------------------------------------------------------------- head pose
  // Generic 3-D head model (mm): nose tip, chin, outer eye corners, mouth corners.
  const POSE_MODEL = [
    [0, 0, 0],
    [0, -330, -65],
    [-225, 170, -135],
    [225, 170, -135],
    [-150, -150, -125],
    [150, -150, -125]
  ];
  const POSE_IDX = [30, 8, 36, 45, 48, 54];

  function poseProject(p, m) {
    const [yaw, pitch, roll, s, tx, ty] = p;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const y1 = m[1] * cp - m[2] * sp;
    const z1 = m[1] * sp + m[2] * cp;
    const x2 = m[0] * cy + z1 * sy;
    const x3 = x2 * cr - y1 * sr;
    const y3 = x2 * sr + y1 * cr;
    return [tx + s * x3, ty - s * y3];
  }

  function solve6(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // Weak-perspective pose fit (Levenberg-Marquardt). Angles in degrees:
  //   yaw   > 0  face turned towards the image's right
  //   pitch > 0  head tilted down (chin to chest)
  //   roll  > 0  head tilted counter-clockwise on screen
  // It is an approximation from 2-D landmarks (no camera calibration), good
  // for "is this face roughly frontal" decisions, not for measurement.
  function estimatePose(positions) {
    const img = POSE_IDX.map((i) => positions[i]);
    if (!img.every(isPt)) return null;
    const io = dist(positions[36], positions[45]);
    if (!(io > 4)) return null;

    const roll0 = -Math.atan2(positions[45].y - positions[36].y, positions[45].x - positions[36].x);
    let p = [0, 0, roll0, io / 450, positions[30].x, positions[30].y];
    const steps = [1e-4, 1e-4, 1e-4, 1e-6, 1e-2, 1e-2];

    const resid = (q) => {
      const r = [];
      POSE_MODEL.forEach((m, i) => {
        const [u, v] = poseProject(q, m);
        r.push(u - img[i].x, v - img[i].y);
      });
      return r;
    };
    const cost = (r) => r.reduce((a, b) => a + b * b, 0);

    let r = resid(p);
    let c = cost(r);
    let lambda = 1e-2;
    for (let it = 0; it < 40; it++) {
      const J = r.map(() => new Array(6).fill(0));
      for (let k = 0; k < 6; k++) {
        const q = p.slice();
        q[k] += steps[k];
        const r2 = resid(q);
        for (let i = 0; i < r.length; i++) J[i][k] = (r2[i] - r[i]) / steps[k];
      }
      const JTJ = Array.from({ length: 6 }, () => new Array(6).fill(0));
      const JTr = new Array(6).fill(0);
      for (let i = 0; i < r.length; i++) {
        for (let a = 0; a < 6; a++) {
          JTr[a] += J[i][a] * r[i];
          for (let b = 0; b < 6; b++) JTJ[a][b] += J[i][a] * J[i][b];
        }
      }
      let improved = false;
      for (let tries = 0; tries < 6; tries++) {
        const A = JTJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)));
        const d = solve6(A, JTr.map((v) => -v));
        if (!d) { lambda *= 10; continue; }
        const q = p.map((v, k) => v + d[k]);
        q[0] = Math.max(-1.4, Math.min(1.4, q[0]));
        q[1] = Math.max(-1.4, Math.min(1.4, q[1]));
        if (q[3] <= 0) { lambda *= 10; continue; }
        const r2 = resid(q);
        const c2 = cost(r2);
        if (c2 < c) {
          const gain = c - c2;
          p = q; r = r2; c = c2; lambda = Math.max(1e-6, lambda / 3);
          improved = gain > 1e-6;
          break;
        }
        lambda *= 4;
      }
      if (!improved) break;
    }
    const deg = 180 / Math.PI;
    const rms = Math.sqrt(c / POSE_MODEL.length) / io;
    return { yaw: p[0] * deg, pitch: p[1] * deg, roll: p[2] * deg, fitError: rms, reliable: rms < 0.25 };
  }

  // ---------------------------------------------------------- image quality
  // gray: Uint8/Float array (w*h) of luma values 0-255.
  function qualityFromGray(gray, w, h) {
    const n = w * h;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += gray[i];
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) varSum += (gray[i] - mean) ** 2;
    const std = Math.sqrt(varSum / n);
    // Variance of the 4-neighbour Laplacian over the interior — the classic
    // cheap blur metric: sharp edges -> large values, blur -> small.
    let ls = 0, lss = 0, cnt = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        ls += lap;
        lss += lap * lap;
        cnt++;
      }
    }
    const lm = ls / cnt;
    const sharpness = lss / cnt - lm * lm;
    return {
      brightness: mean,
      contrast: std,
      sharpness,
      tooDark: mean < CFG.MIN_BRIGHTNESS || std < CFG.MIN_CONTRAST,
      blurry: sharpness < CFG.MIN_SHARPNESS
    };
  }

  let qCanvas = null;
  // Browser wrapper: crops the face box out of a <video>/<img> into 96x96.
  function measureQuality(source, box, sw, sh) {
    try {
      if (!qCanvas) {
        qCanvas = document.createElement('canvas');
        qCanvas.width = qCanvas.height = 96;
      }
      const ctx = qCanvas.getContext('2d', { willReadFrequently: true });
      const pad = 0.1;
      const x = Math.max(0, box.x - box.width * pad);
      const y = Math.max(0, box.y - box.height * pad);
      const w = Math.min(sw - x, box.width * (1 + pad * 2));
      const h = Math.min(sh - y, box.height * (1 + pad * 2));
      if (w < 8 || h < 8) return null;
      ctx.drawImage(source, x, y, w, h, 0, 0, 96, 96);
      const data = ctx.getImageData(0, 0, 96, 96).data;
      const gray = new Float32Array(96 * 96);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return qualityFromGray(gray, 96, 96);
    } catch (_) {
      return null; // tainted canvas etc. — gateway treats "unknown" as pass
    }
  }

  // ---------------------------------------------------- derived expressions
  // face-api's expression net only knows 7 classes (neutral, happy, sad, angry,
  // fearful, disgusted, surprised). funny / excited / shy / contempt are NOT
  // model outputs: they are heuristics that read landmark geometry (mouth
  // opening, eye openness, brow height, lip-corner asymmetry, head pose) and
  // are gated by the 7 native probabilities. They are tuned to be decisive:
  // a clear example of the mood scores high instead of a timid 30-40%.
  const EXTRA_EXPRESSIONS = ['funny', 'excited', 'shy', 'contempt'];

  function deriveExtraExpressions(native, positions, pose) {
    if (!positions || positions.length < 68 || !positions.every(isPt)) return null;
    const P = positions;
    // Roll straight from the eye line (robust, no pose solver needed) and
    // de-rotate so "vertical" measurements stay vertical when the head tilts.
    const roll = Math.atan2(P[45].y - P[36].y, P[45].x - P[36].x); // image space, y down
    const ca = Math.cos(-roll), sa = Math.sin(-roll);
    const n0 = P[30];
    const pts = P.map((p) => {
      const dx = p.x - n0.x, dy = p.y - n0.y;
      return { x: dx * ca - dy * sa, y: dx * sa + dy * ca };
    });
    const io = dist(pts[36], pts[45]);
    const mouthW = dist(pts[48], pts[54]);
    if (!(io > 4) || !(mouthW > 2)) return null;

    const earOf = (a0, a1, a2, a3, a4, a5) =>
      (dist(pts[a1], pts[a5]) + dist(pts[a2], pts[a4])) / (2 * Math.max(1e-6, dist(pts[a0], pts[a3])));
    const EAR = (earOf(36, 37, 38, 39, 40, 41) + earOf(42, 43, 44, 45, 46, 47)) / 2;
    const mouthOpen = dist(pts[62], pts[66]) / mouthW;
    const eyeMidY = (pts[37].y + pts[38].y + pts[43].y + pts[44].y) / 4;
    const browY = (pts[19].y + pts[24].y) / 2;
    const browRaise = (eyeMidY - browY) / io;
    const lipMidY = (pts[51].y + pts[57].y) / 2;
    // how far each mouth corner sits above/below the lip centre line
    const cornerL = (lipMidY - pts[48].y) / mouthW;
    const cornerR = (lipMidY - pts[54].y) / mouthW;
    const asym = Math.abs(cornerL - cornerR);

    const g = (k) => native[k] || 0;
    const happy = g('happy'), surprised = g('surprised'), neutral = g('neutral');
    const negative = g('fearful') + g('sad') * 0.5;

    // FUNNY: laughing — a real smile with an open mouth and/or squinting eyes
    const laugh = smooth(happy, 0.35, 0.8);
    const funny = laugh * clamp01(0.7 * smooth(mouthOpen, 0.1, 0.38) + 0.45 * smooth(0.27 - EAR, -0.01, 0.07));

    // EXCITED: lively — happy or surprised, with wide eyes, lifted brows, open mouth
    const lively = smooth(Math.max(happy, surprised), 0.3, 0.75);
    const excited = lively * clamp01(0.4 * smooth(EAR, 0.28, 0.38) + 0.3 * smooth(browRaise, 0.3, 0.46) + 0.55 * smooth(mouthOpen, 0.08, 0.28));

    // SHY: calm face, head dipped / tilted / turned away, optional soft smile
    // The generic head model reads ~10-16 degrees of 'down' on an ordinary
    // frontal face, so only the part beyond that counts as a dipped head.
    const pitchDown = pose && pose.reliable ? Math.max(0, pose.pitch - 13) : 0;
    const tilt = Math.abs(roll * 180 / Math.PI);
    const turn = pose ? Math.abs(pose.yaw) : 0;
    const softSmile = happy < 0.9 ? happy : 0;
    const calm = clamp01(1 - negative - surprised - g('angry') - g('disgusted'));
    const shy = calm * clamp01(0.45 * smooth(pitchDown, 2, 10) + 0.35 * smooth(tilt, 2, 9) + 0.3 * smooth(turn, 5, 18) + 0.25 * smooth(softSmile, 0.05, 0.4));

    // CONTEMPT: one lip corner lifted/lowered more than the other (a smirk)
    const smirk = smooth(asym, 0.055, 0.13);
    const contempt = smirk * clamp01(0.4 + neutral + g('disgusted') + g('angry') + 0.6 * happy - surprised);

    const r3 = (v) => Math.round(clamp01(v) * 1000) / 1000;
    const out = { funny: r3(funny), excited: r3(excited), shy: r3(shy), contempt: r3(contempt) };
    // raw measurements, only shown in dev mode (?dev=1) to help tune thresholds
    Object.defineProperty(out, '_features', {
      enumerable: false,
      value: { mouthOpen: +mouthOpen.toFixed(3), eyeOpen: +EAR.toFixed(3), browRaise: +browRaise.toFixed(3), lipAsym: +asym.toFixed(3), tiltDeg: +tilt.toFixed(1), pitchDown: +pitchDown.toFixed(1), yaw: +turn.toFixed(1), happy: +happy.toFixed(2), neutral: +neutral.toFixed(2) }
    });
    return out;
  }

  // The 7 native probabilities stay exactly as the model produced them. A
  // derived mood becomes the dominant one when it is clearly present (score
  // >= 0.5) and not dwarfed by the strongest native expression.
  const DERIVED_MIN = 0.45;
  const DERIVED_VS_NATIVE = 0.6;
  function pickDominant(native, extra) {
    let best = null;
    Object.entries(native).forEach(([k, v]) => {
      if (!best || v > best.v) best = { k, v };
    });
    if (extra) {
      let top = null;
      Object.entries(extra).forEach(([k, v]) => {
        if (v >= DERIVED_MIN && v >= DERIVED_VS_NATIVE * best.v && (!top || v > top.v)) top = { k, v };
      });
      if (top) best = top;
    }
    return best.k;
  }

  const api = {
    CFG, loadNets, SymmetryError, repairLandmarks, computeSymmetry, shapeProbabilities,
    estimatePose, qualityFromGray, measureQuality, deriveExtraExpressions, pickDominant,
    EXTRA_EXPRESSIONS, getModelSource: () => modelSource
  };
  root.MienCore = api;
  root.SymmetryError = SymmetryError;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
