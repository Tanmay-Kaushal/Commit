const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { getOrCreateCurrentCycle, settleCycle } = require('../cycles');

const router = express.Router();
router.use(requireAuth);

function getParticipant(pactId, user) {
  return db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND status = 'active' AND (user_id = ? OR email = ?)
  `).get(pactId, user.id, user.email);
}

// Check in to the current cycle of a pact.
router.post('/:pactId/checkin', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Pact is not active' });

  const participant = getParticipant(pact.id, req.user);
  if (!participant) return res.status(403).json({ error: 'Not a participant in this pact' });

  const cycle = getOrCreateCurrentCycle(pact);
  if (cycle.status !== 'active') {
    return res.status(400).json({ error: 'This cycle has already closed' });
  }

  // The UNIQUE(cycle_id, user_id) constraint on check_ins is what actually
  // protects us here — if two requests for the same user land at nearly the
  // same time, the DB itself will reject the second insert rather than us
  // trying to hand-roll a lock. We just need to catch that and respond nicely.
  try {
    const result = db.prepare(`
      INSERT INTO check_ins (cycle_id, user_id, status) VALUES (?, ?, 'on_time')
    `).run(cycle.id, req.user.id);

    const checkIn = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(result.lastInsertRowid);

    logEvent({
      pactId: pact.id,
      cycleId: cycle.id,
      eventType: 'check_in',
      payload: { userId: req.user.id, checkedInAt: checkIn.checked_in_at },
    });

    const io = req.app.get('io');
    io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'check_in', userId: req.user.id });

    res.json(checkIn);
  } catch (err) {
    // node:sqlite throws ERR_SQLITE_ERROR with the constraint name in the
    // message, rather than a dedicated error code like better-sqlite3 does.
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Already checked in for this cycle' });
    }
    throw err;
  }
});

// Flag "I did it but forgot to log it" after being marked as forfeited for
// a closed cycle. Per-user: in a group pact, only your own forfeiture is
// in question.
router.post('/:pactId/dispute', (req, res) => {
  const { cycleId } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const participant = getParticipant(pact.id, req.user);
  if (!participant) return res.status(403).json({ error: 'Not a participant in this pact' });

  const cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ? AND pact_id = ?').get(cycleId, pact.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  if (cycle.status !== 'forfeited') {
    return res.status(400).json({ error: 'Can only dispute a forfeited cycle' });
  }

  const mySettlement = db.prepare(
    'SELECT * FROM cycle_settlements WHERE cycle_id = ? AND user_id = ?'
  ).get(cycle.id, req.user.id);
  if (!mySettlement || mySettlement.completed) {
    return res.status(400).json({ error: 'You were not marked as forfeited for this cycle' });
  }

  try {
    db.prepare(`INSERT INTO disputes (cycle_id, user_id) VALUES (?, ?)`).run(cycle.id, req.user.id);
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'You already raised a dispute for this cycle' });
    }
    throw err;
  }

  logEvent({
    pactId: pact.id,
    cycleId: cycle.id,
    eventType: 'dispute_raised',
    payload: { userId: req.user.id },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'dispute_raised' });

  res.json({ ok: true });
});

// Any other active participant resolves someone's dispute: approve (they
// get retroactively credited as completed and the cycle is resettled) or
// reject (stays forfeited).
router.post('/:pactId/dispute/resolve', (req, res) => {
  const { cycleId, userId, approve } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const resolver = getParticipant(pact.id, req.user);
  if (!resolver) return res.status(403).json({ error: 'Not a participant in this pact' });
  if (resolver.user_id === Number(userId)) {
    return res.status(400).json({ error: "You can't resolve your own dispute" });
  }

  const cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ? AND pact_id = ?').get(cycleId, pact.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

  const dispute = db.prepare(
    `SELECT * FROM disputes WHERE cycle_id = ? AND user_id = ? AND status = 'pending'`
  ).get(cycle.id, userId);
  if (!dispute) return res.status(404).json({ error: 'No pending dispute for that user on this cycle' });

  db.prepare(`
    UPDATE disputes SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?
  `).run(approve ? 'approved' : 'rejected', req.user.id, dispute.id);

  if (approve) {
    try {
      db.prepare(`INSERT INTO check_ins (cycle_id, user_id, status) VALUES (?, ?, 'disputed_approved')`)
        .run(cycle.id, userId);
    } catch (err) {}
    settleCycle(cycle, pact);
  }

  logEvent({
    pactId: pact.id,
    cycleId: cycle.id,
    eventType: 'dispute_resolved',
    payload: { userId: Number(userId), resolvedBy: req.user.id, approved: !!approve },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'dispute_resolved' });

  const updatedCycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ?').get(cycle.id);
  res.json({ ok: true, status: updatedCycle.status });
});

// Confirm that a forfeited stake was actually paid. Either the person who
// owes it (the payer) or anyone who was due a share of it (a receiver) can
// mark it settled — whichever side confirms first.
router.post('/:pactId/settlements/:settlementId/confirm', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const me = getParticipant(pact.id, req.user);
  if (!me) return res.status(403).json({ error: 'Not a participant in this pact' });

  const settlement = db.prepare('SELECT * FROM cycle_settlements WHERE id = ?').get(req.params.settlementId);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

  const cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ? AND pact_id = ?').get(settlement.cycle_id, pact.id);
  if (!cycle) return res.status(404).json({ error: 'Settlement does not belong to this pact' });
  if (settlement.completed || settlement.amount >= 0) {
    return res.status(400).json({ error: 'Only a forfeited stake can be confirmed paid' });
  }

  const isPayer = settlement.user_id === req.user.id;
  const isReceiver = db.prepare(
    'SELECT 1 FROM cycle_settlements WHERE cycle_id = ? AND user_id = ? AND amount > 0'
  ).get(settlement.cycle_id, req.user.id);

  if (!isPayer && !isReceiver) {
    return res.status(403).json({ error: 'Only the payer or someone owed a share can confirm this' });
  }

  db.prepare(`UPDATE cycle_settlements SET settled = 1, settled_by = ? WHERE id = ?`)
    .run(req.user.id, settlement.id);

  logEvent({
    pactId: pact.id,
    cycleId: settlement.cycle_id,
    eventType: 'settlement_confirmed',
    payload: { payerId: settlement.user_id, confirmedBy: req.user.id },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'settlement_confirmed' });

  res.json({ ok: true });
});

module.exports = router;
