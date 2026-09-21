const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { isUsernameTaken, generateUsername } = require('../usernames');
const { mailerConfigured, sendVerificationEmail } = require('../mailer');
const {
  generateCode,
  hashCode,
  compareCode,
  expiryTimestamp,
  isExpired,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} = require('../verification');

const router = express.Router();

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

router.get('/username-available', (req, res) => {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!USERNAME_RULE.test(username)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  res.json({ available: !isUsernameTaken(username) });
});

router.get('/suggest-username', (req, res) => {
  const email = (req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  res.json({ username: generateUsername(email) });
});

// Sends (or resends) a fresh 6-digit code to an unverified account.
async function issueVerificationCode(user) {
  const code = generateCode();
  const codeHash = await hashCode(code);

  db.prepare(`
    UPDATE users
    SET verification_code_hash = ?, verification_expires_at = ?, verification_attempts = 0, verification_last_sent_at = datetime('now')
    WHERE id = ?
  `).run(codeHash, expiryTimestamp(), user.id);

  if (mailerConfigured()) {
    await sendVerificationEmail(user.email, code);
  } else {
    console.log(`[mailer] not configured — verification code for ${user.email}: ${code}`);
  }
}

// Creates the account unverified; a login token is only issued after verify-email.
router.post('/signup', async (req, res) => {
  const { password, timezone, username } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);
  if (existing && existing.email_verified) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  let finalUsername = (username || '').toLowerCase().trim();
  if (finalUsername) {
    if (!USERNAME_RULE.test(finalUsername)) {
      return res.status(400).json({
        error: 'Usernames must be 3-20 characters: lowercase letters, numbers, underscores only',
      });
    }
    if ((!existing || finalUsername !== db.prepare('SELECT username FROM users WHERE id = ?').get(existing.id)?.username) && isUsernameTaken(finalUsername)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
  } else {
    finalUsername = existing ? undefined : generateUsername(email);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  if (existing) {
    db.prepare(`
      UPDATE users SET password_hash = ?, timezone = ?, username = COALESCE(?, username) WHERE id = ?
    `).run(passwordHash, timezone || 'UTC', finalUsername || null, existing.id);
    user = db.prepare('SELECT id, email, username FROM users WHERE id = ?').get(existing.id);
  } else {
    const result = db.prepare(`
      INSERT INTO users (email, username, password_hash, timezone) VALUES (?, ?, ?, ?)
    `).run(email, finalUsername, passwordHash, timezone || 'UTC');
    user = db.prepare('SELECT id, email, username FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  try {
    await issueVerificationCode(user);
  } catch (err) {
    console.error('[auth] failed to send verification email:', err.message);
    return res.status(502).json({ error: 'Could not send the verification email — try again in a moment' });
  }

  res.json({ needsVerification: true, email: user.email });
});

router.post('/verify-email', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = (req.body.code || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No signup in progress for that email' });
  if (user.email_verified) return res.status(400).json({ error: 'This account is already verified — log in instead' });

  if (isExpired(user.verification_expires_at)) {
    return res.status(400).json({ error: 'This code has expired — request a new one' });
  }
  if (user.verification_attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many incorrect attempts — request a new code' });
  }

  const match = await compareCode(code, user.verification_code_hash);
  if (!match) {
    db.prepare('UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = ?').run(user.id);
    const remaining = MAX_ATTEMPTS - (user.verification_attempts + 1);
    return res.status(400).json({ error: remaining > 0 ? `Incorrect code — ${remaining} attempt(s) left` : 'Incorrect code — request a new one' });
  }

  db.prepare(`
    UPDATE users
    SET email_verified = 1, verification_code_hash = NULL, verification_expires_at = NULL, verification_attempts = 0
    WHERE id = ?
  `).run(user.id);

  const verifiedUser = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(user.id);
  const token = signToken(verifiedUser);
  res.json({ user: verifiedUser, token });
});

router.post('/resend-code', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No signup in progress for that email' });
  if (user.email_verified) return res.status(400).json({ error: 'This account is already verified — log in instead' });

  if (user.verification_last_sent_at) {
    const elapsedMs = Date.now() - new Date(user.verification_last_sent_at + 'Z').getTime();
    const remainingSeconds = RESEND_COOLDOWN_SECONDS - Math.floor(elapsedMs / 1000);
    if (remainingSeconds > 0) {
      return res.status(429).json({ error: `Wait ${remainingSeconds}s before requesting another code`, retryAfter: remainingSeconds });
    }
  }

  try {
    await issueVerificationCode(user);
  } catch (err) {
    console.error('[auth] failed to resend verification email:', err.message);
    return res.status(502).json({ error: 'Could not send the verification email — try again in a moment' });
  }

  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
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

  if (!user.email_verified) {
    return res.status(403).json({ error: 'Verify your email before logging in', needsVerification: true, email: user.email });
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
