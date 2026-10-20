// Dashboard logic: auth guard, capture (upload or webcam), run face-api.js
// analysis fully client-side, render results, optionally save to backend.

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

const els = {
  tabUpload: document.getElementById('tab-upload'),
  tabCamera: document.getElementById('tab-camera'),
  uploadPanel: document.getElementById('upload-panel'),
  cameraPanel: document.getElementById('camera-panel'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  webcam: document.getElementById('webcam'),
  captureBtn: document.getElementById('capture-btn'),
  previewArea: document.getElementById('preview-area'),
  previewImg: document.getElementById('preview-img'),
  overlayCanvas: document.getElementById('overlay-canvas'),
  analyzeBtn: document.getElementById('analyze-btn'),
  resetBtn: document.getElementById('reset-btn'),
  loadingArea: document.getElementById('loading-area'),
  loadingLabel: document.getElementById('loading-label'),
  errorArea: document.getElementById('error-area'),
  resultsPanel: document.getElementById('results-panel'),
  resultsPlaceholder: document.getElementById('results-placeholder'),
  resultsContent: document.getElementById('results-content'),
  resultsGrid: document.getElementById('results-grid'),
  expressionsList: document.getElementById('expressions-list'),
  saveBtn: document.getElementById('save-btn'),
  saveError: document.getElementById('save-error')
};

let modelsLoaded = false;
let webcamStream = null;
let lastResult = null; // structured result for saving

// ---------- auth guard ----------
(async function guard() {
  try {
    await Api.me();
  } catch (_) {
    window.location.href = '/login.html?next=scan';
  }
})();

// ---------- tabs ----------
function showUploadTab() {
  els.uploadPanel.style.display = 'block';
  els.cameraPanel.style.display = 'none';
  els.tabUpload.classList.add('active');
  els.tabCamera.classList.remove('active');
  stopWebcam();
}
function showCameraTab() {
  els.uploadPanel.style.display = 'none';
  els.cameraPanel.style.display = 'block';
  els.tabUpload.classList.remove('active');
  els.tabCamera.classList.add('active');
  startWebcam();
}
els.tabUpload.addEventListener('click', showUploadTab);
els.tabCamera.addEventListener('click', showCameraTab);

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 } });
    els.webcam.srcObject = webcamStream;
  } catch (err) {
    showError('Could not access the camera. Check your browser permissions or use upload instead.');
  }
}
function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
}

// ---------- upload (click, keyboard, and drag-and-drop) ----------
els.dropZone.addEventListener('click', () => els.fileInput.click());
els.dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    els.fileInput.click();
  }
});
els.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropZone.classList.add('drag-active');
});
els.dropZone.addEventListener('dragleave', () => {
  els.dropZone.classList.remove('drag-active');
});
els.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('drag-active');
  if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
});
els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files[0]) loadImageFile(els.fileInput.files[0]);
});

// Dropping an image anywhere else on the page (outside the drop-zone) would
// otherwise make the browser navigate away to show the raw file — swallow
// that everywhere except the drop-zone itself, which handles it above.
['dragover', 'drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    if (!els.dropZone.contains(e.target)) e.preventDefault();
  });
});

function loadImageFile(file) {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showError('Please choose a JPG, PNG, or WEBP image.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => showPreview(reader.result);
  reader.onerror = () => showError('Could not read that file — please try another image.');
  reader.readAsDataURL(file);
}

els.captureBtn.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = els.webcam.videoWidth;
  canvas.height = els.webcam.videoHeight;
  canvas.getContext('2d').drawImage(els.webcam, 0, 0);
  showPreview(canvas.toDataURL('image/png'));
});

function showPreview(dataUrl) {
  clearError();
  els.previewImg.src = dataUrl;
  els.previewArea.style.display = 'block';
  resetResultsPanel();
  stopWebcam();
}

els.resetBtn.addEventListener('click', () => {
  els.previewArea.style.display = 'none';
  resetResultsPanel();
  els.fileInput.value = '';
  const ctx = els.overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
  clearError();
});

function resetResultsPanel() {
  els.resultsContent.style.display = 'none';
  els.resultsPlaceholder.style.display = 'flex';
}

// ---------- model loading ----------
async function ensureModels() {
  if (modelsLoaded) return;
  els.loadingArea.style.display = 'flex';
  els.loadingLabel.textContent = 'Loading analysis models…';
  // SsdMobilenetv1 (trained on the WIDER FACE dataset) gives a materially
  // more accurate face box and landmark alignment than the tiny/fast
  // detector, which matters because every downstream ratio (face shape,
  // symmetry) is computed from those landmark positions — a noisier box in
  // means noisier ratios out. It's slower, which is fine for a one-shot
  // analysis rather than a live video overlay.
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // trained on iBUG 300-W / 300VW
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL), // trained on FER2013
    faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL) // trained on IMDB-WIKI (~500k labeled faces)
  ]);
  modelsLoaded = true;
}

// ---------- analysis ----------
els.analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  clearError();
  els.previewArea.style.display = 'none';
  els.loadingArea.style.display = 'flex';

  try {
    await ensureModels();
    els.loadingLabel.textContent = 'Analyzing face…';

    const detection = await faceapi
      .detectSingleFace(els.previewImg, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    els.loadingArea.style.display = 'none';
    els.previewArea.style.display = 'block';

    if (!detection) {
      showError('No face was clearly detected. Try a well-lit, front-facing photo.');
      return;
    }

    drawOverlay(detection);
    lastResult = buildResult(detection);
    renderResults(lastResult);
  } catch (err) {
    els.loadingArea.style.display = 'none';
    els.previewArea.style.display = 'block';
    showError('Analysis failed to load. Check your internet connection and try again.');
    console.error(err);
  }
}

function drawOverlay(detection) {
  const img = els.previewImg;
  const canvas = els.overlayCanvas;
  canvas.width = img.clientWidth;
  canvas.height = img.clientHeight;

  const displaySize = { width: img.clientWidth, height: img.clientHeight };
  faceapi.matchDimensions(canvas, displaySize);
  const resized = faceapi.resizeResults(detection, displaySize);

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(139,92,246,0.8)';
  ctx.shadowBlur = 6;

  const box = resized.detection.box;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  ctx.fillStyle = '#8b5cf6';
  resized.landmarks.positions.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------- dataset-backed classification on top of face-api landmarks ----------
//
// Face shape used to be classified with hand-picked if/else thresholds on a
// single ratio, which is brittle (small measurement noise flips the result
// entirely at each cutoff). Instead we compute the same four ratios for the
// live face and for every archetype in FACE_SHAPE_REFERENCE (reference-data.js),
// then pick the nearest one in normalized ratio-space (nearest-centroid
// classification) and report a confidence based on how much closer it is
// than the runner-up. This degrades gracefully — a borderline face gets a
// low-confidence label instead of silently snapping to the wrong bucket.

function computeRatioVector(landmarks) {
  const pts = landmarks.positions;
  const jawWidth = dist(pts[0], pts[16]);
  const cheekWidth = dist(pts[1], pts[15]);
  const faceHeight = dist(pts[8], midpoint(pts[19], pts[24]));
  const foreheadWidth = dist(pts[17], pts[26]);

  return {
    heightToCheekWidth: faceHeight / cheekWidth,
    jawToCheekWidth: jawWidth / cheekWidth,
    foreheadToCheekWidth: foreheadWidth / cheekWidth,
    jawToForehead: jawWidth / foreheadWidth
  };
}

function ratioDistance(a, b) {
  // Each ratio is weighted equally after normalizing by its typical scale
  // (all four ratios in the reference set sit roughly in 0.6–1.6), so no
  // single ratio dominates the distance just because it has larger units.
  const keys = Object.keys(a);
  let sumSq = 0;
  keys.forEach((k) => {
    sumSq += (a[k] - b[k]) ** 2;
  });
  return Math.sqrt(sumSq / keys.length);
}

function classifyFaceShape(landmarks) {
  const liveRatios = computeRatioVector(landmarks);

  const scored = FACE_SHAPE_REFERENCE.map((ref) => ({
    shape: ref.shape,
    description: ref.description,
    distance: ratioDistance(liveRatios, ref.ratios)
  })).sort((a, b) => a.distance - b.distance);

  const [best, runnerUp] = scored;
  // Confidence: how much closer the best match is than the runner-up,
  // relative to the runner-up's distance. A clear winner -> high confidence;
  // a near-tie between two archetypes -> low confidence.
  const confidence = Math.max(
    0,
    Math.min(1, (runnerUp.distance - best.distance) / Math.max(runnerUp.distance, 0.001))
  );

  return {
    shape: best.shape,
    description: best.description,
    confidence: Math.round(confidence * 100),
    ratios: liveRatios
  };
}

function estimateSymmetry(landmarks) {
  const pts = landmarks.positions;
  const noseTip = pts[30];
  const pairs = [
    [36, 45], // outer eyes
    [39, 42], // inner eyes
    [31, 35], // nose base
    [48, 54], // mouth corners
    [1, 15] // jaw
  ];
  let total = 0;
  pairs.forEach(([li, ri]) => {
    const l = dist(pts[li], noseTip);
    const r = dist(pts[ri], noseTip);
    const diff = Math.abs(l - r) / Math.max(l, r);
    total += diff;
  });
  const avgDiff = total / pairs.length;

  // Calibrate against the typical human asymmetry baseline (see
  // reference-data.js) rather than treating any deviation as a flaw — real
  // faces are never perfectly symmetric. A face right at the population-
  // typical deviation lands around 85, not near 0, and the score falls off
  // from there as deviation grows past that baseline.
  const score = Math.max(0, Math.round(100 - (avgDiff / SYMMETRY_BASELINE_DEVIATION) * 15));
  return Math.min(100, score);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function buildResult(detection) {
  const expressions = detection.expressions;
  const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const shapeMatch = classifyFaceShape(detection.landmarks);

  return {
    age: Math.round(detection.age),
    gender: detection.gender,
    genderProbability: Math.round(detection.genderProbability * 100) / 100,
    dominantExpression: dominant,
    expressions: Object.fromEntries(sorted.map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    faceShape: shapeMatch.shape,
    faceShapeConfidence: shapeMatch.confidence,
    symmetryScore: estimateSymmetry(detection.landmarks),
    landmarksCount: detection.landmarks.positions.length
  };
}

// ---------- render ----------
// Formatting/display only — delegates to the shared renderer in
// results-render.js so the dashboard and history detail view stay in sync.
// The values passed in (r) come straight from buildResult() above, whose
// calculation logic is unchanged.
function renderResults(r) {
  els.resultsPlaceholder.style.display = 'none';
  els.resultsContent.style.display = 'block';
  renderAnalysisCard(els.resultsGrid, els.expressionsList, r);
}

// ---------- save ----------
els.saveBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  els.saveError.style.display = 'none';
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = 'Saving…';
  try {
    await Api.saveScan({
      label: `Scan — ${new Date().toLocaleString()}`,
      ...lastResult,
      thumbnail: els.previewImg.src.length < 400000 ? els.previewImg.src : null
    });
    els.saveBtn.textContent = 'Saved ✓';
  } catch (err) {
    els.saveBtn.textContent = 'Save failed';
    els.saveError.textContent = err.message;
    els.saveError.style.display = 'inline';
    console.error(err);
  } finally {
    setTimeout(() => {
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = 'Save to history';
    }, 1800);
  }
});

// ---------- error helpers ----------
function showError(msg) {
  els.errorArea.textContent = msg;
  els.errorArea.classList.add('visible');
}
function clearError() {
  els.errorArea.textContent = '';
  els.errorArea.classList.remove('visible');
}
