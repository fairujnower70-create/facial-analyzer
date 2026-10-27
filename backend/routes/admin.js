const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [users, scans, today, week, breakdown, recent] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS n FROM users'),
      db.query('SELECT COUNT(*)::int AS n FROM scans'),
      db.query('SELECT COUNT(*)::int AS n FROM scans WHERE created_at::date = CURRENT_DATE'),
      db.query("SELECT COUNT(*)::int AS n FROM users WHERE created_at >= now() - interval '7 days'"),
      db.query(
        `SELECT dominant_expression AS expression, COUNT(*)::int AS count
         FROM scans
         WHERE dominant_expression IS NOT NULL
         GROUP BY dominant_expression
         ORDER BY count DESC`
      ),
      db.query(
        `SELECT s.id, s.dominant_expression, s.created_at, u.name AS user_name
         FROM scans s JOIN users u ON u.id = s.user_id
         ORDER BY s.created_at DESC
         LIMIT 8`
      )
    ]);

    res.json({
      totalUsers: users.rows[0].n,
      totalScans: scans.rows[0].n,
      scansToday: today.rows[0].n,
      newUsersThisWeek: week.rows[0].n,
      expressionBreakdown: breakdown.rows,
      recentActivity: recent.rows
    });
  })
);

// Aggregates for the admin charts (all computed in SQL, nothing heavy sent to the browser).
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const [daily, signups, gender, shapes, ages, hours, topUsers, totals, weekly] = await Promise.all([
      db.query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS count
         FROM generate_series(current_date - 29, current_date, '1 day') d
         LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS n FROM scans GROUP BY 1) c ON c.day = d::date
         ORDER BY d`
      ),
      db.query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS count
         FROM generate_series(current_date - 29, current_date, '1 day') d
         LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS n FROM users GROUP BY 1) c ON c.day = d::date
         ORDER BY d`
      ),
      db.query("SELECT COALESCE(gender, 'unknown') AS label, COUNT(*)::int AS count FROM scans GROUP BY 1 ORDER BY 2 DESC"),
      db.query("SELECT face_shape AS label, COUNT(*)::int AS count FROM scans WHERE face_shape IS NOT NULL GROUP BY 1 ORDER BY 2 DESC"),
      db.query(
        `SELECT bucket AS label, COUNT(*)::int AS count FROM (
           SELECT CASE WHEN age < 18 THEN '<18' WHEN age < 25 THEN '18-24' WHEN age < 35 THEN '25-34'
                       WHEN age < 45 THEN '35-44' WHEN age < 55 THEN '45-54' ELSE '55+' END AS bucket
           FROM scans WHERE age IS NOT NULL) t GROUP BY 1`
      ),
      db.query(
        `SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int AS dow,
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour, COUNT(*)::int AS count
         FROM scans GROUP BY 1, 2`
      ),
      db.query(
        `SELECT u.name, u.email, COUNT(s.id)::int AS count
         FROM users u JOIN scans s ON s.user_id = u.id GROUP BY u.id ORDER BY count DESC LIMIT 6`
      ),
      db.query('SELECT ROUND(AVG(symmetry_score))::int AS sym, ROUND(AVG(age))::int AS age FROM scans'),
      db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM scans WHERE created_at >= now() - interval '7 days') AS scans_now,
           (SELECT COUNT(*)::int FROM scans WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS scans_prev,
           (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS users_now,
           (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS users_prev`
      )
    ]);
    const order = ['<18', '18-24', '25-34', '35-44', '45-54', '55+'];
    const ageMap = Object.fromEntries(ages.rows.map((r) => [r.label, r.count]));
    res.json({
      scansPerDay: daily.rows,
      signupsPerDay: signups.rows,
      gender: gender.rows,
      faceShapes: shapes.rows,
      ageBuckets: order.map((l) => ({ label: l, count: ageMap[l] || 0 })),
      activity: hours.rows, // dow 0=Sunday, hour in UTC
      topUsers: topUsers.rows,
      avgSymmetry: totals.rows[0].sym,
      avgAge: totals.rows[0].age,
      weekly: weekly.rows[0]
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COUNT(s.id)::int AS scan_count
       FROM users u
       LEFT JOIN scans s ON s.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't delete your own account from here" });
    }
    const result = await db.query('DELETE FROM users WHERE id = $1', [targetId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true });
  })
);

// ---------- password reset requests ----------

router.get(
  '/resets',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT r.id, r.created_at, u.id AS user_id, u.name, u.email
       FROM reset_requests r JOIN users u ON u.id = r.user_id
       WHERE r.handled_at IS NULL
       ORDER BY r.created_at DESC`
    );
    res.json({ requests: result.rows });
  })
);

// Sets a new random temporary password and returns it ONCE so the admin can
// pass it to the user (who can then change it on the Account page).
router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    // The admin may type a password of their own; otherwise one is generated.
    const custom = req.body && typeof req.body.password === 'string' ? req.body.password.trim() : '';
    if (custom && custom.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(10);
    let temp = '';
    for (const b of bytes) temp += alphabet[b % alphabet.length];
    if (custom) temp = custom;

    const hash = await bcrypt.hash(temp, 10);
    const result = await db.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING name, email', [hash, targetId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Hand the password to the user inside the app: it is kept for 24 h on the
    // user's request and shown once when they check their request code.
    const upd = await db.query(
      `UPDATE reset_requests SET handled_at = COALESCE(handled_at, now()), delivered_password = $2, delivered_at = now(), collected_at = NULL
       WHERE id = (SELECT id FROM reset_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)
       RETURNING id`,
      [targetId, temp]
    );
    await db.query('UPDATE reset_requests SET handled_at = now() WHERE user_id = $1 AND handled_at IS NULL', [targetId]);
    res.json({
      ok: true,
      temporaryPassword: temp,
      name: result.rows[0].name,
      email: result.rows[0].email,
      deliveredInApp: upd.rowCount > 0
    });
  })
);

// The admin table never shows photos, so thumbnails are left out here to keep
// this response small (a page of 200 scans with photos could be tens of MB).
router.get(
  '/scans',
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT s.id, s.user_id, s.label, s.age, s.gender, s.gender_probability,
              s.dominant_expression, s.expressions_json, s.face_shape,
              s.face_shape_confidence, s.symmetry_score, s.landmarks_count,
              s.created_at, u.name AS user_name, u.email AS user_email
       FROM scans s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC
       LIMIT 200`
    );
    res.json({ scans: result.rows });
  })
);

router.delete(
  '/scans/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    const result = await db.query('DELETE FROM scans WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
