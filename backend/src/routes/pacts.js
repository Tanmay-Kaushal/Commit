const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { logEvent } = require('../events');
const { settleDueDaysForPact, regenerateSchedule, reopenPact, deletePactCompletely, todayInZone, activatePactIfReady, cancelPact } = require('../pactDays');
const { maskFromDays, ALL_DAYS_MASK } = require('../weekdays');
const { notifyUser } = require('../push');

const router = express.Router();
router.use(requireAuth);

const DATE_RULE = /^\d{4}-\d{2}-\d{2}$/;

// Resolves identifiers (email or username) to existing users or bare
// emails to invite. Shared by pact creation and the add-participant route.
function resolveIdentifiers(identifiers, requesterId) {
  const resolved = [];
  for (const identifier of identifiers) {
    const existingUser = db.prepare('SELECT id, email FROM users WHERE email = ? OR (username = ? AND discoverable = 1)').get(identifier, identifier);
    const email = existingUser ? existingUser.email : identifier;
    if (!existingUser && !email.includes('@')) {
      return { status: 404, error: `No user found with the username "${identifier}", and it doesn't look like an email to invite` };
    }
    if (existingUser && existingUser.id === requesterId) {
      return { status: 400, error: "You can't invite yourself to your own pact" };
    }
    resolved.push({ user: existingUser || null, email });
  }
  return { resolved };
}

// Create a pact: a fixed date range plus a weekday mask (scheduledDays is
// an array of ISO weekday numbers, 1=Monday..7=Sunday).
router.post('/', (req, res) => {
  const { habitDescription, stakeAmount, scheduledDays, startDate, endDate, partnerIdentifiers, partnerIdentifier } = req.body;

  // Partners are optional — a pact can be created solo and shared via its link.
  const identifiers = Array.isArray(partnerIdentifiers) && partnerIdentifiers.length > 0
    ? partnerIdentifiers
    : (partnerIdentifier ? [partnerIdentifier] : []);
  const cleanIdentifiers = [...new Set(identifiers.map((i) => (i || '').trim().toLowerCase()).filter(Boolean))];

  if (!habitDescription || !stakeAmount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!Number.isInteger(stakeAmount) || stakeAmount <= 0) {
    return res.status(400).json({ error: 'Stake amount must be a positive whole number' });
  }
  if (!DATE_RULE.test(startDate || '') || !DATE_RULE.test(endDate || '')) {
    return res.status(400).json({ error: 'startDate and endDate are required, as YYYY-MM-DD' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'End date must be on or after the start date' });
  }

  const mask = Array.isArray(scheduledDays) && scheduledDays.length > 0
    ? maskFromDays(scheduledDays)
    : (scheduledDays === 'everyday' ? ALL_DAYS_MASK : 0);
  if (mask === 0) {
    return res.status(400).json({ error: 'Select at least one day of the week' });
  }

  const creator = db.prepare('SELECT timezone FROM users WHERE id = ?').get(req.user.id);
  const timezone = creator?.timezone || 'UTC';
  const today = todayInZone(timezone);

  if (startDate < today) {
    return res.status(400).json({ error: 'Start date cannot be in the past' });
  }

  const isGroup = cleanIdentifiers.length > 1 ? 1 : 0;

  const { status: resolveStatus, error: resolveError, resolved } = resolveIdentifiers(cleanIdentifiers, req.user.id);
  if (resolveError) return res.status(resolveStatus).json({ error: resolveError });

  const result = db.prepare(`
    INSERT INTO habit_pacts (creator_id, habit_description, stake_amount, scheduled_days, start_date, end_date, timezone, status, is_group)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_invite', ?)
  `).run(req.user.id, habitDescription, stakeAmount, mask, startDate, endDate, timezone, isGroup);

  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator) VALUES (?, ?, ?, 'active', 1)
  `).run(pact.id, req.user.id, req.user.email);

  const io = req.app.get('io');
  for (const { user, email } of resolved) {
    db.prepare(`
      INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator) VALUES (?, ?, ?, 'pending_invite', 0)
    `).run(pact.id, user ? user.id : null, email);

    if (user) {
      try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, user.id); } catch (err) {}
      try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(user.id, req.user.id); } catch (err) {}

      notifyUser(
        io,
        user.id,
        'pact_invite',
        { pactId: pact.id, habitDescription, stakeAmount, scheduledDays: mask, startDate, endDate, isGroup: !!isGroup, from: { id: req.user.id, email: req.user.email } },
        { title: 'New pact invite', body: `${req.user.username || req.user.email} invited you to "${habitDescription}".`, url: `/pacts/${pact.id}` }
      );
    }
  }

  logEvent({
    pactId: pact.id,
    eventType: 'pact_created',
    payload: { creatorId: req.user.id, invited: resolved.map((r) => r.email), habitDescription },
  });

  res.json(pact);
});

router.get('/', (req, res) => {
  const pacts = db.prepare(`
    SELECT DISTINCT hp.* FROM habit_pacts hp
    JOIN pact_participants pp ON pp.pact_id = hp.id
    WHERE pp.user_id = ? OR pp.email = ?
    ORDER BY hp.created_at DESC
  `).all(req.user.id, req.user.email);

  res.json(pacts);
});

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

  db.prepare(`UPDATE pact_participants SET user_id = ?, status = 'active' WHERE id = ?`).run(req.user.id, participant.id);

  const creator = db.prepare('SELECT * FROM pact_participants WHERE pact_id = ? AND is_creator = 1').get(pact.id);
  if (creator?.user_id) {
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, creator.user_id); } catch (err) {}
    try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(creator.user_id, req.user.id); } catch (err) {}
  }

  logEvent({ pactId: pact.id, eventType: 'pact_accepted', payload: { userId: req.user.id } });

  // Activate immediately if ready, instead of waiting for the next cron tick.
  activatePactIfReady(pact);

  const updated = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id);
  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_joined' });

  res.json(updated);
});

// Only removes this one participant; other invitees are unaffected.
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
  logEvent({ pactId: pact.id, eventType: 'participant_declined', payload: { userId: req.user.id } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_declined' });

  res.json({ ok: true });
});

router.post('/:id/leave', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Pact is not active' });

  const participant = db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND status = 'active' AND (user_id = ? OR email = ?)
  `).get(pact.id, req.user.id, req.user.email);
  if (!participant) return res.status(403).json({ error: 'Not an active participant in this pact' });

  db.prepare(`UPDATE pact_participants SET status = 'left' WHERE id = ?`).run(participant.id);
  logEvent({ pactId: pact.id, eventType: 'participant_left', payload: { userId: req.user.id } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_left' });

  res.json({ ok: true });
});

// ---- Creator admin actions ----

function requireCreator(pact, userId) {
  return pact.creator_id === userId;
}

// Cancels a pact that's still waiting on a partner to accept — the manual
// counterpart to the fact that the system no longer auto-cancels these.
router.post('/:id/cancel', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can cancel this pact' });
  if (pact.status !== 'pending_invite') return res.status(400).json({ error: 'Only a pact still waiting on a partner can be cancelled' });

  cancelPact(pact);

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'pact_cancelled' });

  res.json(db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id));
});

router.post('/:id/close', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can close this pact' });
  if (pact.status !== 'active') return res.status(400).json({ error: 'Only an active pact can be closed' });

  db.prepare(`UPDATE habit_pacts SET status = 'closed' WHERE id = ?`).run(pact.id);
  logEvent({ pactId: pact.id, eventType: 'pact_closed', payload: { closedBy: req.user.id } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'pact_closed' });

  res.json(db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id));
});

// Reactivates a closed pact — see reopenPact for how the closed gap is handled.
router.post('/:id/reopen', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can reopen this pact' });
  if (pact.status !== 'closed') return res.status(400).json({ error: 'Only a closed pact can be reopened' });

  reopenPact(pact);

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'pact_reopened' });

  res.json(db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id));
});

// Permanently deletes the pact and its history. Only closed/completed/
// cancelled pacts can be removed — close it first. Not reversible.
router.delete('/:id', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can remove this pact' });
  if (!['closed', 'completed', 'cancelled'].includes(pact.status)) {
    return res.status(400).json({ error: 'Close the pact (or let it run its course) before removing it' });
  }

  deletePactCompletely(pact.id);
  res.json({ ok: true });
});

router.post('/:id/participants', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can add participants' });
  if (!['pending_invite', 'active'].includes(pact.status)) {
    return res.status(400).json({ error: 'Cannot add participants to a pact that has ended' });
  }

  const identifiers = Array.isArray(req.body.identifiers) ? req.body.identifiers : [];
  const cleanIdentifiers = [...new Set(identifiers.map((i) => (i || '').trim().toLowerCase()).filter(Boolean))];
  if (cleanIdentifiers.length === 0) return res.status(400).json({ error: 'Provide at least one email or username' });

  const { status: resolveStatus, error: resolveError, resolved } = resolveIdentifiers(cleanIdentifiers, req.user.id);
  if (resolveError) return res.status(resolveStatus).json({ error: resolveError });

  // Compare resolved emails, not raw identifiers — an identifier can be a
  // username, so this catches "already in, invited under a different name".
  const existingEmails = db.prepare('SELECT email FROM pact_participants WHERE pact_id = ?').all(pact.id).map((p) => p.email);
  const alreadyIn = resolved.filter((r) => existingEmails.includes(r.email));
  if (alreadyIn.length > 0) {
    return res.status(409).json({ error: `Already in this pact: ${alreadyIn.map((r) => r.email).join(', ')}` });
  }

  const io = req.app.get('io');
  const added = [];
  for (const { user, email } of resolved) {
    const result = db.prepare(`
      INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator) VALUES (?, ?, ?, 'pending_invite', 0)
    `).run(pact.id, user ? user.id : null, email);
    added.push({ id: result.lastInsertRowid, email });

    if (user) {
      try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(req.user.id, user.id); } catch (err) {}
      try { db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(user.id, req.user.id); } catch (err) {}

      notifyUser(
        io,
        user.id,
        'pact_invite',
        { pactId: pact.id, habitDescription: pact.habit_description, stakeAmount: pact.stake_amount, scheduledDays: pact.scheduled_days, startDate: pact.start_date, endDate: pact.end_date, isGroup: true, from: { id: req.user.id, email: req.user.email } },
        { title: 'New pact invite', body: `${req.user.username || req.user.email} added you to "${pact.habit_description}".`, url: `/pacts/${pact.id}` }
      );
    }
  }

  const totalNonCreator = db.prepare(`SELECT COUNT(*) c FROM pact_participants WHERE pact_id = ? AND is_creator = 0`).get(pact.id).c;
  if (totalNonCreator > 1 && !pact.is_group) {
    db.prepare(`UPDATE habit_pacts SET is_group = 1 WHERE id = ?`).run(pact.id);
  }

  logEvent({ pactId: pact.id, eventType: 'participant_added', payload: { addedBy: req.user.id, invited: resolved.map((r) => r.email) } });
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_added' });

  res.json({ ok: true, added });
});

router.delete('/:id/participants/:participantId', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can remove participants' });

  const participant = db.prepare('SELECT * FROM pact_participants WHERE id = ? AND pact_id = ?').get(req.params.participantId, pact.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  if (participant.is_creator) return res.status(400).json({ error: 'The creator cannot be removed — close the pact instead' });
  if (!['pending_invite', 'active'].includes(participant.status)) {
    return res.status(400).json({ error: 'This participant is already gone' });
  }

  db.prepare(`UPDATE pact_participants SET status = 'removed_by_creator' WHERE id = ?`).run(participant.id);
  logEvent({ pactId: pact.id, eventType: 'participant_removed', payload: { removedBy: req.user.id, participantEmail: participant.email } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'participant_removed' });
  if (participant.user_id) {
    io.to(`user:${participant.user_id}`).emit('pact_update', { pactId: pact.id, type: 'participant_removed' });
  }

  res.json({ ok: true });
});

// Schedule/date changes regenerate the day list; settled days keep their amount.
router.put('/:id', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.id);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });
  if (!requireCreator(pact, req.user.id)) return res.status(403).json({ error: 'Only the creator can modify this pact' });
  if (!['pending_invite', 'active'].includes(pact.status)) {
    return res.status(400).json({ error: 'This pact has already ended and can no longer be modified' });
  }

  const { habitDescription, stakeAmount, scheduledDays, startDate, endDate } = req.body;

  const nextDescription = habitDescription !== undefined ? habitDescription : pact.habit_description;
  if (!nextDescription || !nextDescription.trim()) return res.status(400).json({ error: 'Habit description is required' });

  const nextStake = stakeAmount !== undefined ? stakeAmount : pact.stake_amount;
  if (!Number.isInteger(nextStake) || nextStake <= 0) return res.status(400).json({ error: 'Stake amount must be a positive whole number' });

  const nextStart = startDate !== undefined ? startDate : pact.start_date;
  const nextEnd = endDate !== undefined ? endDate : pact.end_date;
  if (!DATE_RULE.test(nextStart) || !DATE_RULE.test(nextEnd)) return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD' });
  if (nextEnd < nextStart) return res.status(400).json({ error: 'End date must be on or after the start date' });

  const today = todayInZone(pact.timezone);
  if (nextStart < today && nextStart !== pact.start_date) {
    return res.status(400).json({ error: 'Start date cannot be moved into the past' });
  }

  let nextMask = pact.scheduled_days;
  if (scheduledDays !== undefined) {
    nextMask = Array.isArray(scheduledDays) && scheduledDays.length > 0
      ? maskFromDays(scheduledDays)
      : (scheduledDays === 'everyday' ? ALL_DAYS_MASK : 0);
    if (nextMask === 0) return res.status(400).json({ error: 'Select at least one day of the week' });
  }

  const scheduleChanged = nextMask !== pact.scheduled_days || nextStart !== pact.start_date || nextEnd !== pact.end_date;

  db.prepare(`
    UPDATE habit_pacts SET habit_description = ?, stake_amount = ?, scheduled_days = ?, start_date = ?, end_date = ? WHERE id = ?
  `).run(nextDescription, nextStake, nextMask, nextStart, nextEnd, pact.id);

  const updated = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id);
  if (scheduleChanged && updated.status === 'active') {
    regenerateSchedule(updated);
  }

  logEvent({ pactId: pact.id, eventType: 'pact_modified', payload: { modifiedBy: req.user.id, scheduleChanged } });

  const io = req.app.get('io');
  io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: 'pact_modified' });

  res.json(updated);
});

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

  const io = req.app.get('io');

  // Only settles already-past-due days for an already-active pact — never
  // finalizes pending_invite here (that stays a periodic-sweep-only action).
  if (pact.status === 'active') {
    settleDueDaysForPact(pact, io);
  }
  const currentPact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(pact.id);

  let today = null;
  let todayPactDay = null;
  let todayCheckIns = [];

  if (currentPact.status === 'active') {
    today = todayInZone(currentPact.timezone);
    todayPactDay = db.prepare(`SELECT * FROM pact_days WHERE pact_id = ? AND scheduled_date = ?`).get(pact.id, today);
    if (todayPactDay) {
      todayCheckIns = db.prepare('SELECT * FROM check_ins WHERE pact_day_id = ?').all(todayPactDay.id);
    }
  }

  // Scoped to settled days only (not "latest by date"), since almost every
  // pact_day for a long-running pact is still a future placeholder.
  const recentDays = db.prepare(`
    SELECT * FROM pact_days WHERE pact_id = ? AND status = 'settled' ORDER BY scheduled_date DESC LIMIT 30
  `).all(pact.id);

  const dayIds = recentDays.map((d) => d.id);
  let settlementsByDay = {};
  let disputesByDay = {};
  if (dayIds.length > 0) {
    const placeholders = dayIds.map(() => '?').join(',');
    const settlementRows = db.prepare(`
      SELECT ds.*, u.username, u.email FROM day_settlements ds
      JOIN users u ON u.id = ds.user_id
      WHERE ds.pact_day_id IN (${placeholders})
    `).all(...dayIds);
    for (const row of settlementRows) {
      (settlementsByDay[row.pact_day_id] ||= []).push(row);
    }

    const disputeRows = db.prepare(`
      SELECT d.*, u.username, u.email FROM disputes d
      JOIN users u ON u.id = d.user_id
      WHERE d.pact_day_id IN (${placeholders}) AND d.status = 'pending'
    `).all(...dayIds);
    for (const row of disputeRows) {
      (disputesByDay[row.pact_day_id] ||= []).push(row);
    }
  }

  const history = recentDays.map((day) => ({
    ...day,
    settlements: settlementsByDay[day.id] || [],
    disputes: disputesByDay[day.id] || [],
  }));

  res.json({ pact: currentPact, participants, today, todayPactDay, todayCheckIns, history });
});

module.exports = router;
