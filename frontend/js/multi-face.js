// "Scan all faces": for photos with several people. It reuses the exact same
// models and the same buildResult() calculation from analyze.js for every face
// — only the detection call differs (detectAllFaces instead of detectSingleFace).
(function () {
  const analyzeBtn = document.getElementById('analyze-btn');
  const previewImg = document.getElementById('preview-img');
  const canvas = document.getElementById('overlay-canvas');
  if (!analyzeBtn || !previewImg || !canvas) return;

  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost';
  btn.id = 'multi-btn';
  btn.textContent = 'Scan all faces';
  btn.title = 'Analyse every face in a group photo';
  analyzeBtn.insertAdjacentElement('afterend', btn);

  const panel = document.getElementById('results-panel');
  const box = document.createElement('div');
  box.id = 'multi-results';
  box.style.display = 'none';
  panel.appendChild(box);

  function clearMulti() {
    current = [];
    box.style.display = 'none';
    box.innerHTML = '';
  }
  analyzeBtn.addEventListener('click', clearMulti);
  document.getElementById('reset-btn').addEventListener('click', clearMulti);

  let current = []; // [{ result, box }] for the faces on screen

  const PALETTE = ['#8b5cf6', '#22d3ee', '#f59e0b', '#ec4899', '#10b981', '#f43f5e', '#6366f1', '#84cc16'];

  btn.addEventListener('click', async () => {
    clearError();
    els.previewArea.style.display = 'none';
    els.loadingArea.style.display = 'flex';
    try {
      await ensureModels();
      els.loadingLabel.textContent = 'Finding all faces…';
      const tInfer = performance.now();
      const detections = await faceapi
        .detectAllFaces(previewImg, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceExpressions()
        .withAgeAndGender();

      els.loadingArea.style.display = 'none';
      els.previewArea.style.display = 'block';

      if (!detections.length) {
        showError('No faces were clearly detected. Try a well-lit photo.');
        return;
      }
      draw(detections);
      MienTelemetry.record({ source: 'multi', faces: detections.length, inferenceMs: performance.now() - tInfer, totalMs: performance.now() - tInfer });
      current = detections.map((d) => ({ result: buildResult(d), box: d.detection.box }));
      render(current.map((c) => c.result));
    } catch (err) {
      els.loadingArea.style.display = 'none';
      els.previewArea.style.display = 'block';
      showError('Analysis failed to load. Check your internet connection and try again.');
      console.error(err);
    }
  });

  function draw(detections) {
    canvas.width = previewImg.clientWidth;
    canvas.height = previewImg.clientHeight;
    const size = { width: previewImg.clientWidth, height: previewImg.clientHeight };
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detections.forEach((det, i) => {
      const r = faceapi.resizeResults(det, size);
      const b = r.detection.box;
      const color = PALETTE[i % PALETTE.length];
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      const tag = 24;
      ctx.fillRect(b.x, Math.max(0, b.y - tag), tag, tag);
      ctx.fillStyle = '#04060c'; ctx.font = '700 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), b.x + tag / 2, Math.max(0, b.y - tag) + tag / 2);
      ctx.fillStyle = color;
      r.landmarks.positions.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2); ctx.fill(); });
    });
  }

  function render(results) {
    els.resultsPlaceholder.style.display = 'none';
    els.resultsContent.style.display = 'none';
    if (typeof setMood === 'function') setMood(null);
    const happy = results.filter((r) => r.dominantExpression === 'happy').length;
    box.style.display = 'block';
    box.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
        <h2 style="font-size:20px; margin:0;">${results.length} face${results.length === 1 ? '' : 's'} found</h2>
        <span class="muted" style="font-size:13px;">${happy} looking happy</span>
      </div>
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        <p class="field-hint" style="margin:0; flex:1 1 220px;">Each face is saved as its own scan, with its own cropped photo.</p>
        <button class="btn btn-primary" id="multi-save-btn">Save all ${results.length} to history</button>
      </div>
      <p id="multi-save-msg" class="field-hint" style="margin:-6px 0 12px; display:none;"></p>
      <div style="display:flex; flex-direction:column; gap:12px;">` +
      results
        .map(
          (r, i) => `
        <div class="card multi-card" style="border-left:4px solid ${PALETTE[i % PALETTE.length]};">
          <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px;">
            <b style="font-family:var(--font-display);">Face ${i + 1}</b>${emotionBadge(r.dominantExpression)}
          </div>
          <div class="multi-stats">
            <div><span class="muted">Age</span><b>~${Math.round(r.age)}</b></div>
            <div><span class="muted">Gender</span><b>${capWord(r.gender)}</b></div>
            <div><span class="muted">Face shape</span><b>${r.faceShape || '—'}</b></div>
            <div><span class="muted">Symmetry</span><b>${r.symmetryScore != null ? Math.round(r.symmetryScore) : '—'}/100</b></div>
          </div>
        </div>`
        )
        .join('') +
      '</div>';
    document.getElementById('multi-save-btn').addEventListener('click', saveAll);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveAll() {
    const saveBtn = document.getElementById('multi-save-btn');
    const msg = document.getElementById('multi-save-msg');
    if (!current.length) return;
    saveBtn.disabled = true;
    msg.style.display = 'block';
    msg.style.color = '';
    const stamp = new Date().toLocaleString();
    let ok = 0;
    const failed = [];
    for (let i = 0; i < current.length; i++) {
      saveBtn.textContent = `Saving ${i + 1}/${current.length}…`;
      const { result, box: b } = current[i];
      if (current[i].saved) { ok++; continue; } // already saved on an earlier attempt
      try {
        await Api.saveScan({
          label: `Group photo — Face ${i + 1} of ${current.length} — ${stamp}`,
          ...result,
          thumbnail: makeFaceThumbnail(previewImg, b) || makeThumbnail(previewImg)
        });
        current[i].saved = true;
        ok++;
      } catch (err) {
        failed.push(`Face ${i + 1}: ${err.message}`);
      }
    }
    if (failed.length) {
      msg.style.color = 'var(--danger)';
      msg.textContent = `${ok} saved, ${failed.length} failed — ${failed[0]}`;
      saveBtn.textContent = 'Retry save all';
      saveBtn.disabled = false;
    } else {
      msg.textContent = `All ${ok} faces saved. Find them in History.`;
      saveBtn.textContent = 'Saved ✓';
    }
  }
})();
