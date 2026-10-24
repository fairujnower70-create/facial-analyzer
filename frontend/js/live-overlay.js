// Live camera overlay: a purely cosmetic layer on the scan page. While the
// webcam is on it tracks the face (tiny, fast detector) and draws landmark
// dots + a locked-on frame. It never feeds the analysis — "Capture frame" still
// runs the exact same full-accuracy pipeline in analyze.js.
(function () {
  const video = document.getElementById('webcam');
  const canvas = document.getElementById('live-canvas');
  const frame = document.getElementById('live-frame');
  const status = document.getElementById('live-status');
  if (!video || !canvas || !frame) return;

  let running = false;
  let failed = false;
  let loading = null;

  function setStatus(text, locked) {
    if (status.textContent !== text) status.textContent = text;
    frame.classList.toggle('locked', !!locked);
  }

  async function ensureLiveModels() {
    if (typeof faceapi === 'undefined') throw new Error('face-api not ready');
    if (faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68Net.isLoaded) return;
    if (!loading) {
      loading = Promise.all([
        faceapi.nets.tinyFaceDetector.isLoaded ? null : faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.isLoaded ? null : faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
      ]);
    }
    await loading;
  }

  function draw(det) {
    const w = video.clientWidth;
    const h = video.clientHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!det) return;

    const sx = w / video.videoWidth;
    const sy = h / video.videoHeight;
    const pts = det.landmarks.positions.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    const b = det.detection.box;

    ctx.shadowColor = 'rgba(139,92,246,0.9)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 2;
    const bx = b.x * sx, by = b.y * sy, bw = b.width * sx, bh = b.height * sy, c = Math.min(bw, bh) * 0.18;
    ctx.beginPath();
    [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.moveTo(x + dx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * c);
    });
    ctx.stroke();

    // jaw line + dots
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.slice(0, 17).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = '#c4b5fd';
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  async function tick() {
    if (!running) return;
    if (!video.srcObject || video.readyState < 2) {
      if (!video.srcObject) return stop();
      return setTimeout(tick, 200);
    }
    if (!failed) {
      try {
        await ensureLiveModels();
        const det = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
          .withFaceLandmarks();
        draw(det);
        setStatus(det ? 'Face locked — ready to capture' : 'Looking for a face…', !!det);
      } catch (err) {
        failed = true; // overlay is optional; the scan-line animation still runs
        draw(null);
        setStatus('Camera ready — capture when you are', false);
      }
    }
    setTimeout(tick, failed ? 1000 : 140);
  }

  function start() {
    frame.classList.add('on');
    if (running) return;
    running = true;
    setStatus(failed ? 'Camera ready — capture when you are' : 'Looking for a face…', false);
    tick();
  }

  function stop() {
    running = false;
    frame.classList.remove('on', 'locked');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStatus('Starting camera…', false);
  }

  video.addEventListener('playing', start);
  video.addEventListener('emptied', stop);
  // analyze.js clears srcObject's tracks on stop; catch that too.
  setInterval(() => {
    if (running && (!video.srcObject || !video.srcObject.active)) stop();
  }, 800);
})();
