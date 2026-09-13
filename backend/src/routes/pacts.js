const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { getOrCreateCurrentCycle } = require('../cycles');

const router = express.Router();
router.use(requireAuth);

// Create a new pact and invite a partner by email.
router.post('/', (req, res) => {
  const { habitDescription, frequencyPerWeek, stakeAmount, cycleLengthDays, partnerEmail } = req.body;

  if (!habitDescription || !frequencyPerWeek || !stakeAmount || !partnerEmail) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = db.prepare(`
    INSERT INTO habit_pacts
      (creator_id, partner_email, habit_description, frequency_per_week, stake_amount, cycle_length_days, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_invite')
  `).run(
    req.user.id,
    partnerEmail,
    habitDescription,
    frequencyPerWeek,
    stakeAmount,
    cycleLengthDays || 7
  );

  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(result.lastInsertRowid);

  logEvent({
    pactId: pact.id,
    eventType: 'pact_created',
    payload: { creatorId: req.user.id, partnerEmail, habitDescription },
  });

  res.json(pact);
});

// List pacts the current user is involved in (as creator, partner, or pending invite by email).
router.get('/', (req, res) => {
  const pacts = db.prepare(`
    SELECT * FROM habit_pacts
    WHERE creator_id = ? OR partner_id = ? OR partner_email = ?
    ORDER BY created_at DESC
  `).all(req.user.id, req.user.id, req.user.email);

  res.json(pacts);
});

// Accept a pending invite (the invited partner logs in and hits this).
router.post('/:id/accept', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);

  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.partner_email !== req.user.email) {
    return res.status(403).json({ error: 'This invite is not for you' });
  }
  if (pact.status !== 'pending_invite') {
    return res.status(400).json({ error: 'This pact is not awaiting an invite response' });
  }

  db.prepare(`
    UPDATE habit_pacts SET partner_id = ?, status = 'active' WHERE id = ?
  `).run(req.user.id, pact.id);

  logEvent({
    pactId: pact.id,
    eventType: 'pact_accepted',
    payload: { partnerId: req.user.id },
  });

  const updated = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id);

  // touch the current cycle so both users have something to check into right away
  if (updated.status === 'active') {
    getOrCreateCurrentCycle(updated);
  }

  res.json(updated);
});

// Get a single pact plus its current cycle and both users' check-in status.
router.get('/:id', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const isParticipant = pact.creator_id === req.user.id || pact.partner_id === req.user.id;
  if (!isParticipant) return res.status(403).json({ error: 'Not a participant in this pact' });

  let cycle = null;
  let checkIns = [];

  if (pact.status === 'active') {
    cycle = getOrCreateCurrentCycle(pact);
    checkIns = db.prepare('SELECT * FROM check_ins WHERE cycle_id = ?').all(cycle.id);
  }

  res.json({ pact, cycle, checkIns });
});

module.exports = router;
