const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { isUsernameTaken, generateUsername } = require('../usernames');

const router = express.Router();

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

router.get('/username-available', (req, res) => {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!USERNAME_RULE.test(username)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  res.json({ available: !isUsernameTaken(username) });
});

// Verifies the ID token Google's sign-in button hands the frontend,
// creates the account on first sign-in (or links google_id to an
// existing account with the same email — see db.js's v2 migration), and
// issues our own session token. This is the only way in or out now.
router.post('/google', async (req, res) => {
  if (!googleClient) {
    return res.status(502).json({ error: 'Google sign-in is not configured on this server' });
  }

  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google sign-in' });
  }

  if (!payload.email_verified) {
    return res.status(403).json({ error: 'Your Google email is not verified' });
  }
  const email = payload.email.toLowerCase();

  let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(payload.sub, email);
  if (user) {
    if (!user.google_id) {
      db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(payload.sub, user.id);
    }
  } else {
    const username = generateUsername(email);
    const result = db.prepare(`
      INSERT INTO users (email, username, google_id, timezone) VALUES (?, ?, ?, 'UTC')
    `).run(email, username, payload.sub);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
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

// Edit basic profile details. Email is intentionally not editable here — it's tied to the Google account.
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
