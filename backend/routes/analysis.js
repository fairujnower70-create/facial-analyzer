const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Save a scan result computed client-side (face-api.js runs in the browser;
// the backend just persists the structured output per user).
router.post('/', requireAuth, (req, res) => {
  const {
    label,
    age,
    gender,
    genderProbability,
    dominantExpression,
    expressions,
    faceShape,
    faceShapeConfidence,
    symmetryScore,
    landmarksCount,
    thumbnail
  } = req.body || {};

  if (age === undefined || !gender || !dominantExpression) {
    return res.status(400).json({ error: 'Incomplete analysis payload' });
  }

  const info = db
    .prepare(
      `INSERT INTO scans
        (user_id, label, age, gender, gender_probability, dominant_expression, expressions_json, face_shape, face_shape_confidence, symmetry_score, landmarks_count, thumbnail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      label || 'Scan',
      age,
      gender,
      genderProbability || null,
      dominantExpression,
      JSON.stringify(expressions || {}),
      faceShape || null,
      faceShapeConfidence || null,
      symmetryScore || null,
      landmarksCount || null,
      thumbnail || null
    );

  const saved = db.prepare('SELECT * FROM scans WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ scan: saved });
});

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM scans WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ scans: rows });
});

router.delete('/:id', requireAuth, (req, res) => {
  const info = db
    .prepare('DELETE FROM scans WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
