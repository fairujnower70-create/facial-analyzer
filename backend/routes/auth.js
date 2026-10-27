const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !isValidEmail(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Role rules:
    //  - ADMIN_EMAIL set  -> only that email becomes admin.
    //  - ADMIN_EMAIL unset -> the very first account on an empty database becomes admin.
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const forcedRole = adminEmail ? (cleanEmail === adminEmail ? 'admin' : 'user') : null;

    let inserted;
    try {
      inserted = await db.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3,
                 COALESCE($4::text, CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'admin' ELSE 'user' END))
         RETURNING id, name, email, role`,
        [cleanName, cleanEmail, passwordHash, forcedRole]
      );
    } catch (err) {
      // 23505 = unique violation (two signups with the same email at the same moment)
      if (err.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      throw err;
    }

    const user = inserted.rows[0];
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user });
  })
);

// Very small in-memory limiter so the forgot-password form can't be spammed.
const forgotHits = new Map();
function tooManyForgots(ip) {
  const now = Date.now();
  const hits = (forgotHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  hits.push(now);
  forgotHits.set(ip, hits);
  return hits.length > 25;
}

// Tells the user when no account matches, because a person (the admin) handles the request.
router.post(
  '/forgot',
  asyncHandler(async (req, res) => {
    if (tooManyForgots(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    const found = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (found.rowCount === 0) {
      // The admin handles these by hand, so a typo'd email must not look like
      // a successful request (the admin would never see it).
      return res.status(404).json({ error: 'No account found with that email. Check the spelling or sign up.' });
    }
    const userId = found.rows[0].id;
    // A fresh request code every time (replaces the one on a still-pending request).
    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const pending = await db.query(
      'SELECT id FROM reset_requests WHERE user_id = $1 AND handled_at IS NULL',
      [userId]
    );
    if (pending.rowCount === 0) {
      await db.query('INSERT INTO reset_requests (user_id, pin_hash) VALUES ($1, $2)', [userId, hashPin(pin)]);
    } else {
      await db.query('UPDATE reset_requests SET pin_hash = $1, pin_attempts = 0 WHERE id = $2', [hashPin(pin), pending.rows[0].id]);
    }
    res.json({ ok: true, pin });
  })
);

function hashPin(pin) {
  return crypto.createHmac('sha256', JWT_SECRET).update(String(pin)).digest('hex');
}

// "Check my request": the user enters their email + request code. While the
// admin has not answered it says pending; once the admin has prepared a
// temporary password it is shown ONCE and then removed from the server.
router.post(
  '/reset-status',
  asyncHandler(async (req, res) => {
    if (tooManyForgots(req.ip)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const pin = String((req.body && req.body.pin) || '').trim();
    if (!isValidEmail(email) || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'Enter your email and the 6-digit request code.' });
    }
    const r = await db.query(
      `SELECT r.* FROM reset_requests r JOIN users u ON u.id = r.user_id
       WHERE lower(u.email) = $1 ORDER BY r.created_at DESC LIMIT 1`,
      [email]
    );
    const row = r.rows[0];
    if (!row || !row.pin_hash || row.pin_attempts >= 10) {
      return res.status(404).json({ error: 'Request not found. Check the email and code.' });
    }
    if (hashPin(pin) !== row.pin_hash) {
      await db.query('UPDATE reset_requests SET pin_attempts = pin_attempts + 1 WHERE id = $1', [row.id]);
      return res.status(404).json({ error: 'Request not found. Check the email and code.' });
    }
    if (!row.handled_at) return res.json({ status: 'pending' });

    const fresh = row.delivered_at && Date.now() - new Date(row.delivered_at).getTime() < 24 * 3600 * 1000;
    if (row.delivered_password && fresh) {
      await db.query(
        'UPDATE reset_requests SET delivered_password = NULL, collected_at = now() WHERE id = $1',
        [row.id]
      );
      return res.json({ status: 'ready', temporaryPassword: row.delivered_password });
    }
    res.json({ status: row.collected_at ? 'collected' : 'handled' });
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
