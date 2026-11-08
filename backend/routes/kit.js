const express = require('express');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// The short note a person writes to themselves for bad days.
router.get(
  '/note',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await db.query('SELECT kit_note FROM users WHERE id = $1', [req.user.id]);
    res.json({ note: (r.rows[0] && r.rows[0].kit_note) || '' });
  })
);

router.put(
  '/note',
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = req.body && typeof req.body.note === 'string' ? req.body.note : '';
    const note = raw.trim().slice(0, 280);
    await db.query('UPDATE users SET kit_note = $1 WHERE id = $2', [note || null, req.user.id]);
    res.json({ note });
  })
);

module.exports = router;
