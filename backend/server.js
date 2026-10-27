require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const db = require('./db');
const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;

// Render (and most hosts) put a proxy in front of the app and terminate HTTPS
// there. This lets Express know the original request was secure.
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' })); // thumbnails are small base64 strings
app.use(cookieParser());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// Simple health check (Render can ping this to know the app is alive).
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/scans', analysisRoutes);
app.use('/api/admin', adminRoutes);

// Serve the frontend as static files
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// Digital Asset Links: lets the installed Android app (made with PWABuilder)
// open in full-screen without the browser address bar. The file is stored as
// frontend/well-known/assetlinks.json (no leading dot, easy to upload to
// GitHub) and served at the URL Android looks for.
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json');
  res.sendFile(path.join(FRONTEND_DIR, 'well-known', 'assetlinks.json'), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});
// AI model weights and the face-api bundle never change between deploys, so
// browsers may keep them for a long time (the service worker caches them too).
const LONG_CACHE = { maxAge: '30d', immutable: true };
app.use('/models', express.static(path.join(FRONTEND_DIR, 'models'), LONG_CACHE));
app.use('/vendor', express.static(path.join(FRONTEND_DIR, 'vendor'), LONG_CACHE));
app.use(express.static(FRONTEND_DIR));

// Fallback to index.html for the root
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// Connect to the database first, then start accepting requests.
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Facial Analyzer server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  });
