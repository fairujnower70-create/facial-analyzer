const express = require('express');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Save a scan result computed client-side (face-api.js runs in the browser;
// the backend just persists the structured output per user).
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
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

    const result = await db.query(
      `INSERT INTO scans
        (user_id, label, age, gender, gender_probability, dominant_expression, expressions_json,
         face_shape, face_shape_confidence, symmetry_score, landmarks_count, thumbnail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
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
      ]
    );

    res.status(201).json({ scan: result.rows[0] });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT * FROM scans WHERE user_id = $1 ORDER BY created_at DESC', [
      req.user.id
    ]);
    res.json({ scans: result.rows });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    const result = await db.query('DELETE FROM scans WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
