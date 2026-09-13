const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../auth');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, password, timezone } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, timezone) VALUES (?, ?, ?)
  `).run(email, passwordHash, timezone || 'UTC');

  const user = db.prepare('SELECT id, email, timezone FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken(user);

  res.json({ user, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({
    user: { id: user.id, email: user.email, timezone: user.timezone },
    token,
  });
});

module.exports = router;
