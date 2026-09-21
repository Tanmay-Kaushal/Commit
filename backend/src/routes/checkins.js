const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { todayInZone, settleDay, getActiveParticipants } = require('../pactDays');
const { notifyUser } = require('../push');

const router = express.Router();
router.use(requireAuth);

// Re-raisable after rejection (capped) so one rejection isn't final.
const MAX_DISPUTE_ATTEMPTS = 3;

function getParticipant(pactId, user) {
  return db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND status = 'active' AND (user_id = ? OR email = ?)
  `).get(pactId, user.id, user.email);
}

router.post('/:pactId/checkin', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Pact is not active' });

  const participant = getParticipant(pact.id, req.user);
  if (!participant) return res.status(403).json({ error: 'Not a participant in this pact' });

  const today = todayInZone(pact.timezone);
  const pactDay = db.prepare(`SELECT * FROM pact_days WHERE pact_id = ? AND scheduled_date = ?`).get(pact.id, today);
  if (!pactDay) {
    return res.status(400).json({ error: 'Today is not a scheduled day for this pact' });
  }
  if (pactDay.status !== 'pending') {
    return res.status(400).json({ error: 'Today has already been settled' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO check_ins (pact_day_id, user_id, status) VALUES (?, ?, 'on_time')
    `).run(pactDay.id, req.user.id);

    const checkIn = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(result.lastInsertRowid);

    logEvent({ pactId: pact.id, pactDayId: pactDay.id, eventType: 'check_in', payload: { userId: req.user.id } });

    const io = req.app.get('io');
    io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'check_in', userId: req.user.id });

    res.json(checkIn);
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Already checked in for today' });
    }
    throw err;
  }
});

// Undo a mistaken check-in — only today, only while still pending.
router.delete('/:pactId/checkin', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Pact is not active' });

  const participant = getParticipant(pact.id, req.user);
  if (!participant) return res.status(403).json({ error: 'Not a participant in this pact' });

  const today = todayInZone(pact.timezone);
  const pactDay = db.prepare(`SELECT * FROM pact_days WHERE pact_id = ? AND scheduled_date = ?`).get(pact.id, today);
  if (!pactDay) return res.status(400).json({ error: 'Today is not a scheduled day for this pact' });
  if (pactDay.status !== 'pending') return res.status(400).json({ error: 'Today has already been settled — this can no longer be undone' });

  const result = db.prepare('DELETE FROM check_ins WHERE pact_day_id = ? AND user_id = ?').run(pactDay.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "You haven't checked in today" });

  logEvent({ pactId: pact.id, pactDayId: pactDay.id, eventType: 'check_in_undone', payload: { userId: req.user.id } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'check_in_undone', userId: req.user.id });

  res.json({ ok: true });
});

router.post('/:pactId/dispute', (req, res) => {
  const { pactDayId } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const participant = getParticipant(pact.id, req.user);
  if (!participant) return res.status(403).json({ error: 'Not a participant in this pact' });

  const day = db.prepare('SELECT * FROM pact_days WHERE id = ? AND pact_id = ?').get(pactDayId, pact.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  if (day.status !== 'settled') return res.status(400).json({ error: 'Can only dispute a settled day' });

  const mySettlement = db.prepare('SELECT * FROM day_settlements WHERE pact_day_id = ? AND user_id = ?').get(day.id, req.user.id);
  if (!mySettlement || mySettlement.completed) {
    return res.status(400).json({ error: 'You were not marked as having missed this day' });
  }

  const attempts = db.prepare(`SELECT COUNT(*) c FROM disputes WHERE pact_day_id = ? AND user_id = ?`).get(day.id, req.user.id).c;
  if (attempts >= MAX_DISPUTE_ATTEMPTS) {
    return res.status(409).json({ error: `You've already disputed this day ${MAX_DISPUTE_ATTEMPTS} times` });
  }
  const pending = db.prepare(`SELECT 1 FROM disputes WHERE pact_day_id = ? AND user_id = ? AND status = 'pending'`).get(day.id, req.user.id);
  if (pending) return res.status(409).json({ error: 'You already have a pending dispute for this day' });

  db.prepare(`INSERT INTO disputes (pact_day_id, user_id) VALUES (?, ?)`).run(day.id, req.user.id);

  logEvent({ pactId: pact.id, pactDayId: day.id, eventType: 'dispute_raised', payload: { userId: req.user.id, attempt: attempts + 1 } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'dispute_raised' });

  res.json({ ok: true, attempt: attempts + 1, attemptsRemaining: MAX_DISPUTE_ATTEMPTS - attempts - 1 });
});

// Any other active participant resolves a dispute; approving resettles the day.
router.post('/:pactId/dispute/resolve', (req, res) => {
  const { pactDayId, userId, approve } = req.body;
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const resolver = getParticipant(pact.id, req.user);
  if (!resolver) return res.status(403).json({ error: 'Not a participant in this pact' });
  if (resolver.user_id === Number(userId)) {
    return res.status(400).json({ error: "You can't resolve your own dispute" });
  }

  const day = db.prepare('SELECT * FROM pact_days WHERE id = ? AND pact_id = ?').get(pactDayId, pact.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });

  const dispute = db.prepare(`SELECT * FROM disputes WHERE pact_day_id = ? AND user_id = ? AND status = 'pending'`).get(day.id, userId);
  if (!dispute) return res.status(404).json({ error: 'No pending dispute for that user on this day' });

  db.prepare(`UPDATE disputes SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`)
    .run(approve ? 'approved' : 'rejected', req.user.id, dispute.id);

  const io = req.app.get('io');

  if (approve) {
    try {
      db.prepare(`INSERT INTO check_ins (pact_day_id, user_id, status) VALUES (?, ?, 'disputed_approved')`).run(day.id, userId);
    } catch (err) {}
    settleDay(day, pact);
  }

  logEvent({
    pactId: pact.id,
    pactDayId: day.id,
    eventType: 'dispute_resolved',
    payload: { userId: Number(userId), resolvedBy: req.user.id, approved: !!approve },
  });

  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'dispute_resolved' });

  const updatedDay = db.prepare('SELECT * FROM pact_days WHERE id = ?').get(day.id);
  res.json({ ok: true, status: updatedDay.status, approved: !!approve });
});

// Either the payer or anyone owed a share can confirm a missed stake was paid.
router.post('/:pactId/settlements/:settlementId/confirm', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const me = getParticipant(pact.id, req.user);
  if (!me) return res.status(403).json({ error: 'Not a participant in this pact' });

  const settlement = db.prepare('SELECT * FROM day_settlements WHERE id = ?').get(req.params.settlementId);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

  const day = db.prepare('SELECT * FROM pact_days WHERE id = ? AND pact_id = ?').get(settlement.pact_day_id, pact.id);
  if (!day) return res.status(404).json({ error: 'Settlement does not belong to this pact' });
  if (settlement.completed || settlement.amount_cents >= 0) {
    return res.status(400).json({ error: 'Only a missed-day stake can be confirmed paid' });
  }
  if (settlement.settled) {
    return res.status(400).json({ error: 'Already confirmed paid' });
  }

  const receivers = db.prepare(`
    SELECT ds.*, u.username, u.email FROM day_settlements ds
    JOIN users u ON u.id = ds.user_id
    WHERE ds.pact_day_id = ? AND ds.amount_cents > 0
  `).all(day.id);
  const isPayer = settlement.user_id === req.user.id;
  const isReceiver = receivers.some((r) => r.user_id === req.user.id);

  if (!isPayer && !isReceiver) {
    return res.status(403).json({ error: 'Only the payer or someone owed a share can confirm this' });
  }

  db.prepare(`UPDATE day_settlements SET settled = 1, settled_by = ?, settled_at = datetime('now') WHERE id = ?`)
    .run(req.user.id, settlement.id);

  const payer = db.prepare('SELECT username, email FROM users WHERE id = ?').get(settlement.user_id);

  logEvent({
    pactId: pact.id,
    pactDayId: day.id,
    eventType: 'settlement_confirmed',
    payload: { payerId: settlement.user_id, confirmedBy: req.user.id },
  });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'settlement_confirmed' });

  for (const receiver of receivers) {
    const amount = receiver.amount_cents / 100;
    notifyUser(
      io,
      receiver.user_id,
      'payment_received',
      {
        pactId: pact.id,
        habitDescription: pact.habit_description,
        scheduledDate: day.scheduled_date,
        amount,
        payer: { id: settlement.user_id, username: payer?.username, email: payer?.email },
      },
      { title: 'Payment received', body: `${payer?.username || payer?.email} paid ${amount} for "${pact.habit_description}".`, url: `/pacts/${pact.id}` }
    );
  }

  res.json({ ok: true });
});

module.exports = router;
