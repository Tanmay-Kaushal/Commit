const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { isUsernameTaken, generateUsername } = require('../usernames');
const { serializeUser, USER_COLUMNS } = require('../userSerializer');

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

  const { credential, timezone } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  // Only trusted as a brand-new account's initial value (see below) — never
  // overwrites an existing account's own saved timezone. Validated by
  // asking Intl to actually use it, since a bogus string would otherwise
  // sit silently in the users table until the user's next manual edit.
  let initialTimezone = 'UTC';
  if (typeof timezone === 'string' && timezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: timezone });
      initialTimezone = timezone;
    } catch {
      // invalid IANA zone name — keep the UTC fallback
    }
  }

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
      INSERT INTO users (email, username, google_id, timezone) VALUES (?, ?, ?, ?)
    `).run(email, username, payload.sub, initialTimezone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  const token = signToken(user);
  res.json({ user: serializeUser(user), token });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(serializeUser(user));
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

  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json(serializeUser(user));
});

// Permanently deletes the account. Blocked while the user is in an active
// pact or has an unpaid debt, so a stake obligation can never just vanish.
// A pact this user created either passes to its longest-standing other
// participant, or — if no one else is left — is deleted entirely along
// with its days/check-ins/settlements/disputes. Everywhere else (friends'
// pact history, event logs) this user's id simply stops resolving to an
// account; the text already written stays, per how events.js stores it
// (plain JSON payload, not a live foreign key).
router.delete('/me', requireAuth, (req, res) => {
  const userId = req.user.id;

  const activePact = db
    .prepare(
      `SELECT hp.id, hp.habit_description FROM pact_participants pp
       JOIN habit_pacts hp ON hp.id = pp.pact_id
       WHERE pp.user_id = ? AND hp.status = 'active' LIMIT 1`
    )
    .get(userId);
  if (activePact) {
    return res.status(409).json({
      error: `You're still in an active pact ("${activePact.habit_description}"). Leave or finish it before deleting your account.`,
    });
  }

  const unpaidDebt = db
    .prepare(`SELECT COUNT(*) c FROM day_settlements WHERE user_id = ? AND amount_cents < 0 AND settled = 0`)
    .get(userId);
  if (unpaidDebt.c > 0) {
    return res.status(409).json({
      error: `You have ${unpaidDebt.c} unpaid stake${unpaidDebt.c === 1 ? '' : 's'} outstanding. Settle up before deleting your account.`,
    });
  }

  db.transaction(() => {
    const ownedPacts = db.prepare('SELECT id FROM habit_pacts WHERE creator_id = ?').all(userId);

    for (const pact of ownedPacts) {
      const others = db
        .prepare(
          `SELECT user_id, created_at FROM pact_participants
           WHERE pact_id = ? AND user_id IS NOT NULL AND user_id != ? AND is_creator = 0
           ORDER BY created_at ASC`
        )
        .all(pact.id, userId);

      if (others.length > 0) {
        const nextOwner = others[0].user_id;
        db.prepare('UPDATE habit_pacts SET creator_id = ? WHERE id = ?').run(nextOwner, pact.id);
        db.prepare('UPDATE pact_participants SET is_creator = 1 WHERE pact_id = ? AND user_id = ?').run(pact.id, nextOwner);
      } else {
        const dayIds = db.prepare('SELECT id FROM pact_days WHERE pact_id = ?').all(pact.id).map((d) => d.id);
        if (dayIds.length > 0) {
          const placeholders = dayIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM check_ins WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
          db.prepare(`DELETE FROM day_settlements WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
          db.prepare(`DELETE FROM disputes WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
        }
        db.prepare('DELETE FROM events WHERE pact_id = ?').run(pact.id);
        db.prepare('DELETE FROM pact_days WHERE pact_id = ?').run(pact.id);
        db.prepare('DELETE FROM pact_participants WHERE pact_id = ?').run(pact.id);
        db.prepare('DELETE FROM habit_pacts WHERE id = ?').run(pact.id);
      }
    }

    db.prepare('DELETE FROM check_ins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM day_settlements WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM disputes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM pact_participants WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?').run(userId, userId);
    db.prepare('DELETE FROM friend_requests WHERE requester_id = ? OR addressee_id = ?').run(userId, userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  res.json({ ok: true });
});

module.exports = router;
