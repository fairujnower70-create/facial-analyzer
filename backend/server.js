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

app.use(express.json({ limit: '5mb' })); 
app.use(cookieParser());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// ক্লাউড এপিআই রাউটিং পাইপলাইন ম্যাপ
app.use('/api/auth', authRoutes);
app.use('/api/scans', analysisRoutes);
app.use('/api/admin', adminRoutes);

// ফ্রন্টএন্ড স্ট্যাটিক ফাইল রেন্ডারিং
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// গ্লোবাল এরর হ্যান্ডেলার
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, () => {
  console.log(`Facial Analyzer server running successfully on Cloud Architecture!`);
});

