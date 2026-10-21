const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
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

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), passwordHash);

  // The very first account on a fresh database becomes an admin automatically.
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  let role = 'user';
  if (userCount === 1) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(info.lastInsertRowid);
    role = 'admin';
  }

  const user = { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
  res.status(201).json({ user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
