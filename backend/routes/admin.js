const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const totalScans = db.prepare('SELECT COUNT(*) AS n FROM scans').get().n;
  const scansToday = db
    .prepare("SELECT COUNT(*) AS n FROM scans WHERE date(created_at) = date('now')")
    .get().n;
  const newUsersThisWeek = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')")
    .get().n;
  const expressionBreakdown = db
    .prepare(
      `SELECT dominant_expression AS expression, COUNT(*) AS count
       FROM scans
       WHERE dominant_expression IS NOT NULL
       GROUP BY dominant_expression
       ORDER BY count DESC`
    )
    .all();
  const recentActivity = db
    .prepare(
      `SELECT s.id, s.dominant_expression, s.created_at, u.name AS user_name
       FROM scans s JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC
       LIMIT 8`
    )
    .all();

  res.json({ totalUsers, totalScans, scansToday, newUsersThisWeek, expressionBreakdown, recentActivity });
});

router.get('/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COUNT(s.id) AS scan_count
       FROM users u
       LEFT JOIN scans s ON s.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )
    .all();
  res.json({ users: rows });
});

router.delete('/users/:id', (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account from here" });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ ok: true });
});

router.get('/scans', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM scans s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC
       LIMIT 200`
    )
    .all();
  res.json({ scans: rows });
});

router.delete('/scans/:id', (req, res) => {
  const info = db.prepare('DELETE FROM scans WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
