const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { getOrCreateCurrentCycle, getActiveParticipants } = require('../cycles');

const router = express.Router();
router.use(requireAuth);

// Create a new pact and invite one or more partners by email or username.
// `partnerIdentifier` (single string) keeps working for the classic 2-person
// flow; `partnerIdentifiers` (array) is the new group-pact option — either
// is accepted, but at least one partner is required either way.
router.post('/', (req, res) => {
  const { habitDescription, frequencyPerWeek, stakeAmount, cycleLengthDays, partnerIdentifier, partnerIdentifiers } = req.body;

  const identifiers = Array.isArray(partnerIdentifiers) && partnerIdentifiers.length > 0
    ? partnerIdentifiers
    : (partnerIdentifier ? [partnerIdentifier] : []);

  const cleanIdentifiers = [...new Set(identifiers.map((i) => (i || '').trim().toLowerCase()).filter(Boolean))];

  if (!habitDescription || !frequencyPerWeek || !stakeAmount || cleanIdentifiers.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const isGroup = cleanIdentifiers.length > 1 ? 1 : 0;

  // Resolve each identifier to an existing user (by email or username), or
  // treat it as a bare email invite for someone who hasn't signed up yet.
  const resolved = [];
  for (const identifier of cleanIdentifiers) {
    const existingUser = db.prepare(
      'SELECT id, email FROM users WHERE email = ? OR username = ?'
    ).get(identifier, identifier);

    const email = existingUser ? existingUser.email : identifier;
    if (!existingUser && !email.includes('@')) {
      return res.status(404).json({ error: `No user found with the username "${identifier}", and it doesn't look like an email to invite` });
    }
    if (existingUser && existingUser.id === req.user.id) {
      return res.status(400).json({ error: "You can't invite yourself to your own pact" });
    }
    resolved.push({ user: existingUser || null, email });
  }

  // Legacy single-partner columns are kept populated for backwards
  // compatibility with any code/reports that still read them directly.
  const primaryPartner = resolved[0];

  const result = db.prepare(`
    INSERT INTO habit_pacts
      (creator_id, partner_id, partner_email, habit_description, frequency_per_week, stake_amount, cycle_length_days, status, is_group)
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'pending_invite', ?)
  `).run(
    req.user.id,
    primaryPartner.email,
    habitDescription,
    frequencyPerWeek,
    stakeAmount,
    cycleLengthDays || 7,
    isGroup
  );

  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator)
    VALUES (?, ?, ?, 'active', 1)
  `).run(pact.id, req.user.id, req.user.email);

  const io = req.app.get('io');

  for (const { user, email } of resolved) {
    db.prepare(`
      INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator)
      VALUES (?, ?, ?, 'pending_invite', 0)
    `).run(pact.id, user ? user.id : null, email);

    // Auto-add as a friend for next time (mutual, since we already know
    // both people want to be pact partners).
    if (user) {
      try {
        db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, user.id);
      } catch (err) {}
      try {
        db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(user.id, req.user.id);
      } catch (err) {}

      // If they already have an account, push a live invite popup.
      io.to(`user:${user.id}`).emit('pact_invite', {
        pactId: pact.id,
        habitDescription,
        frequencyPerWeek,
        stakeAmount,
        cycleLengthDays: cycleLengthDays || 7,
        isGroup: !!isGroup,
        from: { id: req.user.id, email: req.user.email },
      });
    }
  }

  logEvent({
    pactId: pact.id,
    eventType: 'pact_created',
    payload: { creatorId: req.user.id, invited: resolved.map((r) => r.email), habitDescription },
  });

  res.json(pact);
});

// List pacts the current user is involved in, as a participant of any kind.
router.get('/', (req, res) => {
  const pacts = db.prepare(`
    SELECT DISTINCT hp.* FROM habit_pacts hp
    JOIN pact_participants pp ON pp.pact_id = hp.id
    WHERE pp.user_id = ? OR pp.email = ?
    ORDER BY hp.created_at DESC
  `).all(req.user.id, req.user.email);

  res.json(pacts);
});

function activatePactIfReady(pact) {
  const participants = db.prepare('SELECT * FROM pact_participants WHERE pact_id = ?').all(pact.id);
  const stillPending = participants.some((p) => p.status === 'pending_invite');
  if (!stillPending && pact.status === 'pending_invite') {
    db.prepare(`UPDATE habit_pacts SET status = 'active' WHERE id = ?`).run(pact.id);
    return true;
  }
  return false;
}

// Accept a pending invite (the invited partner logs in and hits this).
router.post('/:id/accept', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const participant = db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND (user_id = ? OR email = ?)
  `).get(pact.id, req.user.id, req.user.email);

  if (!participant) return res.status(403).json({ error: 'This invite is not for you' });
  if (participant.status !== 'pending_invite') {
    return res.status(400).json({ error: 'This pact is not awaiting your response' });
  }

  db.prepare(`
    UPDATE pact_participants SET user_id = ?, status = 'active' WHERE id = ?
  `).run(req.user.id, participant.id);

  const creator = db.prepare('SELECT * FROM pact_participants WHERE pact_id = ? AND is_creator = 1').get(pact.id);

  // Make sure both directions of the friendship exist now that we know
  // who accepted.
  if (creator?.user_id) {
    try {
      db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, creator.user_id);
    } catch (err) {}
    try {
      db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(creator.user_id, req.user.id);
    } catch (err) {}
  }

  const becameActive = activatePactIfReady(pact);

  logEvent({
    pactId: pact.id,
    eventType: 'pact_accepted',
    payload: { userId: req.user.id },
  });

  const updated = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id);

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_joined' });

  // Touch the current cycle so everyone has something to check into once
  // the pact is fully staffed.
  if (updated.status === 'active' && becameActive) {
    getOrCreateCurrentCycle(updated);
  }

  res.json(updated);
});

// Reject a pending invite.
router.post('/:id/reject', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const participant = db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND (user_id = ? OR email = ?)
  `).get(pact.id, req.user.id, req.user.email);

  if (!participant) return res.status(403).json({ error: 'This invite is not for you' });
  if (participant.status !== 'pending_invite') {
    return res.status(400).json({ error: 'This pact is not awaiting your response' });
  }

  db.prepare(`UPDATE pact_participants SET status = 'declined' WHERE id = ?`).run(participant.id);
  db.prepare(`UPDATE habit_pacts SET status = 'declined' WHERE id = ?`).run(pact.id);

  logEvent({
    pactId: pact.id,
    eventType: 'pact_declined',
    payload: { userId: req.user.id },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_declined' });

  res.json({ ok: true });
});

// Get a single pact plus its current cycle, all participants, and
// everyone's check-in / settlement status for that cycle.
router.get('/:id', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const participants = db.prepare(`
    SELECT pp.*, u.username, u.email as user_email
    FROM pact_participants pp
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE pp.pact_id = ?
    ORDER BY pp.is_creator DESC, pp.created_at ASC
  `).all(pact.id);

  const isParticipant = participants.some((p) => p.user_id === req.user.id || p.email === req.user.email);
  if (!isParticipant) return res.status(403).json({ error: 'Not a participant in this pact' });

  let cycle = null;
  let checkIns = [];
  let settlements = [];
  let disputes = [];

  if (pact.status === 'active') {
    cycle = getOrCreateCurrentCycle(pact);
    checkIns = db.prepare('SELECT * FROM check_ins WHERE cycle_id = ?').all(cycle.id);
  }

  // Also surface settlement/dispute info for the most recently closed
  // cycle, so the UI can show "here's what everyone owes" right after a
  // cycle ends without needing a separate history view.
  const lastClosedCycle = db.prepare(`
    SELECT * FROM habit_cycles WHERE pact_id = ? AND status != 'active' ORDER BY cycle_end DESC LIMIT 1
  `).get(pact.id);

  if (lastClosedCycle) {
    settlements = db.prepare(`
      SELECT cs.*, u.username, u.email FROM cycle_settlements cs
      JOIN users u ON u.id = cs.user_id
      WHERE cs.cycle_id = ?
    `).all(lastClosedCycle.id);

    disputes = db.prepare(`
      SELECT d.*, u.username, u.email FROM disputes d
      JOIN users u ON u.id = d.user_id
      WHERE d.cycle_id = ? AND d.status = 'pending'
    `).all(lastClosedCycle.id);
  }

  res.json({ pact, participants, cycle, checkIns, lastClosedCycle, settlements, disputes });
});

module.exports = router;
