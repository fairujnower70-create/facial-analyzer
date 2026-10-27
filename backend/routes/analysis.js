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
      faceShapeScores,
      symmetryScore,
      landmarksCount,
      thumbnail,
      clientId,
      capturedAt
    } = req.body || {};

    if (age === undefined || !gender || !dominantExpression) {
      return res.status(400).json({ error: 'Incomplete analysis payload' });
    }

    // Offline-queue support: a stable clientId makes a retried upload a no-op,
    // and capturedAt keeps the original scan time (only if it looks sane).
    const cid = typeof clientId === 'string' && clientId.length > 0 && clientId.length <= 64 ? clientId : null;
    let takenAt = null;
    if (capturedAt) {
      const t = new Date(capturedAt);
      const now = Date.now();
      if (!isNaN(t) && t.getTime() <= now + 5 * 60 * 1000 && t.getTime() > now - 90 * 24 * 3600 * 1000) takenAt = t.toISOString();
    }

    const result = await db.query(
      `INSERT INTO scans
        (user_id, label, age, gender, gender_probability, dominant_expression, expressions_json,
         face_shape, face_shape_confidence, symmetry_score, landmarks_count, thumbnail, face_shape_scores, client_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, now()))
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
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
        thumbnail || null,
        faceShapeScores && typeof faceShapeScores === 'object' ? JSON.stringify(faceShapeScores) : null,
        cid,
        takenAt
      ]
    );

    if (result.rowCount === 0) {
      // already saved earlier (duplicate upload from the offline queue)
      const existing = await db.query('SELECT * FROM scans WHERE user_id = $1 AND client_id = $2', [req.user.id, cid]);
      return res.status(200).json({ scan: existing.rows[0], duplicate: true });
    }
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
