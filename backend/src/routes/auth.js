const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { isUsernameTaken, generateUsername } = require('../usernames');

const router = express.Router();

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

// Lets the signup form check a username (auto-generated or user-typed)
// against the database before submitting.
router.get('/username-available', (req, res) => {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!USERNAME_RULE.test(username)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  res.json({ available: !isUsernameTaken(username) });
});

// Suggests a username based on an email, before the account exists yet.
router.get('/suggest-username', (req, res) => {
  const email = (req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  res.json({ username: generateUsername(email) });
});

router.post('/signup', async (req, res) => {
  const { email, password, timezone, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  let finalUsername = (username || '').toLowerCase().trim();

  if (finalUsername) {
    if (!USERNAME_RULE.test(finalUsername)) {
      return res.status(400).json({
        error: 'Usernames must be 3-20 characters: lowercase letters, numbers, underscores only',
      });
    }
    if (isUsernameTaken(finalUsername)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
  } else {
    finalUsername = generateUsername(email);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, username, password_hash, timezone) VALUES (?, ?, ?, ?)
  `).run(email, finalUsername, passwordHash, timezone || 'UTC');

  const user = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken(user);

  res.json({ user, token });
});

router.post('/login', async (req, res) => {
  // Accepts either field name so old clients sending `email` keep working,
  // but the login form now offers a single "email or username" box.
  const { identifier, email, password } = req.body;
  const value = (identifier || email || '').trim().toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(value, value);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email/username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email/username or password' });
  }

  const token = signToken(user);
  res.json({
    user: { id: user.id, email: user.email, username: user.username, timezone: user.timezone },
    token,
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Edit basic profile details. Email is intentionally not editable here.
router.put('/me', requireAuth, (req, res) => {
  const { username, timezone } = req.body;

  let finalUsername = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id).username;

  if (username !== undefined && username !== null) {
    const normalized = username.toLowerCase().trim();
    if (!USERNAME_RULE.test(normalized)) {
      return res.status(400).json({
        error: 'Usernames must be 3-20 characters: lowercase letters, numbers, underscores only',
      });
    }
    if (normalized !== finalUsername && isUsernameTaken(normalized)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    finalUsername = normalized;
  }

  const finalTimezone = timezone && timezone.trim() ? timezone.trim() : undefined;

  db.prepare(`
    UPDATE users SET username = ?, timezone = COALESCE(?, timezone) WHERE id = ?
  `).run(finalUsername, finalTimezone || null, req.user.id);

  const user = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
