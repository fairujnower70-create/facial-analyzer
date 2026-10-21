require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '5mb' })); // thumbnails are small base64 strings
app.use(cookieParser());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/scans', analysisRoutes);
app.use('/api/admin', adminRoutes);

// Serve the frontend as static files
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Fallback to index.html for the root
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, () => {
  console.log(`Facial Analyzer server running at http://localhost:${PORT}`);
});
