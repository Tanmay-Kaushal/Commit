const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { getOrCreateUserInviteCode, getOrCreatePactInviteCode } = require('../inviteCodes');
const { getFriendInvitePreview, getPactInvitePreview } = require('../invitePreview');
const { mailerConfigured, sendInviteEmail } = require('../mailer');

const router = express.Router();

const EMAIL_INVITE_DAILY_LIMIT = 10;
const EMAIL_INVITE_RECIPIENT_COOLDOWN_HOURS = 24;

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
}

// ---- "Invite friends on Commit" (Profile page) ----

router.get('/friend-link', requireAuth, (req, res) => {
  const code = getOrCreateUserInviteCode(req.user.id);
  res.json({ code, url: `${appUrl()}/i/${code}` });
});

// Public preview — used by /i/:code page and index.js's meta tags.
router.get('/friend/:code', (req, res) => {
  const preview = getFriendInvitePreview(req.params.code);
  if (!preview) return res.status(404).json({ error: 'This invite link is no longer valid' });
  res.json(preview);
});

// Opening the link while logged in is the acceptance — no separate step.
router.post('/friend/:code/claim', requireAuth, (req, res) => {
  const preview = getFriendInvitePreview(req.params.code);
  if (!preview) return res.status(404).json({ error: 'This invite link is no longer valid' });
  if (preview.userId === req.user.id) return res.status(400).json({ error: "That's your own invite link" });

  const alreadyFriends = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?').get(req.user.id, preview.userId);
  if (!alreadyFriends) {
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, preview.userId); } catch (err) {}
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(preview.userId, req.user.id); } catch (err) {}

    db.prepare(`
      UPDATE friend_requests SET status = 'accepted', resolved_at = datetime('now')
      WHERE status = 'pending' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    `).run(req.user.id, preview.userId, preview.userId, req.user.id);
  }

  const io = req.app.get('io');
  io.to(`user:${preview.userId}`).emit('friend_request_accepted', { by: { id: req.user.id, email: req.user.email } });

  res.json({ ok: true, alreadyFriends: !!alreadyFriends, friend: { id: preview.userId, username: preview.username, email: preview.email } });
});

// ---- Pact invite links ("Send pact link") ----

router.get('/pact-link/:pactId', requireAuth, (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.creator_id !== req.user.id) return res.status(403).json({ error: 'Only the creator can share this pact\'s link' });
  if (!['pending_invite', 'active'].includes(pact.status)) return res.status(400).json({ error: 'This pact is no longer accepting new participants' });

  const code = getOrCreatePactInviteCode(pact.id);
  res.json({ code, url: `${appUrl()}/p/${code}` });
});

router.get('/pact/:code', (req, res) => {
  const preview = getPactInvitePreview(req.params.code);
  if (!preview) return res.status(404).json({ error: 'This invite link is no longer valid' });
  res.json(preview);
});

// Adds the user as a pending participant, same shape as a socket invite.
router.post('/pact/:code/claim', requireAuth, (req, res) => {
  const preview = getPactInvitePreview(req.params.code);
  if (!preview) return res.status(404).json({ error: 'This invite link is no longer valid' });

  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(preview.pactId);
  const existing = db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND (user_id = ? OR email = ?)
  `).get(pact.id, req.user.id, req.user.email);

  if (existing) {
    return res.json({
      pactId: pact.id,
      habitDescription: pact.habit_description,
      stakeAmount: pact.stake_amount,
      scheduledDays: pact.scheduled_days,
      startDate: pact.start_date,
      endDate: pact.end_date,
      isGroup: !!pact.is_group,
      from: preview.from,
      alreadyParticipant: true,
      participantStatus: existing.status,
    });
  }

  db.prepare(`
    INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator) VALUES (?, ?, ?, 'pending_invite', 0)
  `).run(pact.id, req.user.id, req.user.email);

  if (preview.from) {
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, preview.from.id); } catch (err) {}
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(preview.from.id, req.user.id); } catch (err) {}
  }

  const totalNonCreator = db.prepare(`SELECT COUNT(*) c FROM pact_participants WHERE pact_id = ? AND is_creator = 0`).get(pact.id).c;
  if (totalNonCreator > 1 && !pact.is_group) {
    db.prepare(`UPDATE habit_pacts SET is_group = 1 WHERE id = ?`).run(pact.id);
  }

  logEvent({ pactId: pact.id, eventType: 'participant_added', payload: { addedBy: 'invite_link', userId: req.user.id } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_added' });

  res.json({
    pactId: pact.id,
    habitDescription: pact.habit_description,
    stakeAmount: pact.stake_amount,
    scheduledDays: pact.scheduled_days,
    startDate: pact.start_date,
    endDate: pact.end_date,
    isGroup: !!pact.is_group,
    from: preview.from,
    alreadyParticipant: false,
  });
});

// ---- "Invite to Commit" — email someone who has no account yet ----

router.post('/email', requireAuth, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ? AND email_verified = 1').get(email);
  if (existingUser) return res.status(409).json({ error: 'That email already has a Commit account — send a friend request instead' });

  if (!mailerConfigured()) return res.status(502).json({ error: 'Email is not configured on this server' });

  const sentToday = db.prepare(`
    SELECT COUNT(*) c FROM invite_emails_sent WHERE sender_id = ? AND created_at > datetime('now', '-24 hours')
  `).get(req.user.id).c;
  if (sentToday >= EMAIL_INVITE_DAILY_LIMIT) {
    return res.status(429).json({ error: `You can send up to ${EMAIL_INVITE_DAILY_LIMIT} invite emails a day — try again tomorrow` });
  }

  const recentlyInvited = db.prepare(`
    SELECT id FROM invite_emails_sent WHERE recipient_email = ? AND created_at > datetime('now', ?)
  `).get(email, `-${EMAIL_INVITE_RECIPIENT_COOLDOWN_HOURS} hours`);
  if (recentlyInvited) {
    return res.status(429).json({ error: 'An invite was already sent to that address recently — try again later' });
  }

  const inviter = db.prepare('SELECT username, email FROM users WHERE id = ?').get(req.user.id);
  const code = getOrCreateUserInviteCode(req.user.id);
  const inviteUrl = `${appUrl()}/i/${code}`;

  try {
    await sendInviteEmail(email, inviter.username || inviter.email, inviteUrl);
  } catch (err) {
    console.error('[invites] failed to send invite email:', err.message);
    return res.status(502).json({ error: 'Could not send the invite email — try again in a moment' });
  }

  db.prepare('INSERT INTO invite_emails_sent (sender_id, recipient_email) VALUES (?, ?)').run(req.user.id, email);

  res.json({ ok: true });
});

module.exports = router;
