const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { getOrCreateCurrentCycle } = require('../cycles');

const router = express.Router();
router.use(requireAuth);

// Check in to the current cycle of a pact.
router.post('/:pactId/checkin', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Pact is not active' });

  const isParticipant = pact.creator_id === req.user.id || pact.partner_id === req.user.id;
  if (!isParticipant) return res.status(403).json({ error: 'Not a participant in this pact' });

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

// Flag "I did it but forgot to log it" after a forfeit.
router.post('/:pactId/dispute', (req, res) => {
  const { cycleId } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ? AND pact_id = ?').get(cycleId, pact.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  if (cycle.status !== 'forfeited') {
    return res.status(400).json({ error: 'Can only dispute a forfeited cycle' });
  }

  db.prepare(`UPDATE habit_cycles SET status = 'disputed' WHERE id = ?`).run(cycle.id);

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

// Partner resolves a dispute: approve (mark completed) or reject (back to forfeited).
router.post('/:pactId/dispute/resolve', (req, res) => {
  const { cycleId, approve } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ? AND pact_id = ?').get(cycleId, pact.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  if (cycle.status !== 'disputed') {
    return res.status(400).json({ error: 'This cycle is not under dispute' });
  }

  const newStatus = approve ? 'completed' : 'forfeited';
  db.prepare(`UPDATE habit_cycles SET status = ? WHERE id = ?`).run(newStatus, cycle.id);

  logEvent({
    pactId: pact.id,
    cycleId: cycle.id,
    eventType: 'dispute_resolved',
    payload: { resolvedBy: req.user.id, approved: !!approve },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'dispute_resolved' });

  res.json({ ok: true, status: newStatus });
});

module.exports = router;
