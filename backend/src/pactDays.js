const { DateTime } = require('luxon');
const db = require('./db');
const { logEvent } = require('./events');
const { isDayScheduled } = require('./weekdays');
const { notifyUser } = require('./push');

function todayInZone(timezone) {
  return DateTime.now().setZone(timezone).toISODate();
}

// Materializes every scheduled date up front instead of lazily.
function generatePactDays(pact) {
  const start = DateTime.fromISO(pact.start_date, { zone: pact.timezone });
  const end = DateTime.fromISO(pact.end_date, { zone: pact.timezone });

  const insert = db.prepare(`INSERT OR IGNORE INTO pact_days (pact_id, scheduled_date) VALUES (?, ?)`);

  return db.transaction(() => {
    let cursor = start;
    let created = 0;
    while (cursor <= end) {
      if (isDayScheduled(pact.scheduled_days, cursor.weekday)) {
        const result = insert.run(pact.id, cursor.toISODate());
        if (result.changes > 0) created++;
      }
      cursor = cursor.plus({ days: 1 });
    }
    return created;
  });
}

// Used after the creator edits the schedule/date range.
function regenerateSchedule(pact) {
  const safeToDelete = db.prepare(`
    SELECT pd.id FROM pact_days pd
    WHERE pd.pact_id = ? AND pd.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM check_ins ci WHERE ci.pact_day_id = pd.id)
  `).all(pact.id);

  deleteDaysAndUnlinkEvents(safeToDelete.map((r) => r.id));
  return generatePactDays(pact);
}

function deleteDaysAndUnlinkEvents(dayIds) {
  if (dayIds.length === 0) return;
  const unlinkEvent = db.prepare('UPDATE events SET pact_day_id = NULL WHERE pact_day_id = ?');
  const del = db.prepare('DELETE FROM pact_days WHERE id = ?');
  db.transaction(() => {
    for (const id of dayIds) {
      unlinkEvent.run(id);
      del.run(id);
    }
  });
}

// Voids stale pending days instead of settling them as missed.
function reopenPact(pact) {
  const today = todayInZone(pact.timezone);
  const stale = db.prepare(`
    SELECT id FROM pact_days WHERE pact_id = ? AND status = 'pending' AND scheduled_date < ?
  `).all(pact.id, today);

  deleteDaysAndUnlinkEvents(stale.map((r) => r.id));
  db.prepare(`UPDATE habit_pacts SET status = 'active' WHERE id = ?`).run(pact.id);
  logEvent({ pactId: pact.id, eventType: 'pact_reopened', payload: {} });
}

// Deletes a pact and everything under it. Never touches users/friendships.
function deletePactCompletely(pactId) {
  db.transaction(() => {
    const dayIds = db.prepare('SELECT id FROM pact_days WHERE pact_id = ?').all(pactId).map((r) => r.id);
    if (dayIds.length > 0) {
      const placeholders = dayIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM check_ins WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
      db.prepare(`DELETE FROM day_settlements WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
      db.prepare(`DELETE FROM disputes WHERE pact_day_id IN (${placeholders})`).run(...dayIds);
    }
    db.prepare('DELETE FROM events WHERE pact_id = ?').run(pactId);
    db.prepare('DELETE FROM pact_days WHERE pact_id = ?').run(pactId);
    db.prepare('DELETE FROM pact_participants WHERE pact_id = ?').run(pactId);
    db.prepare('DELETE FROM habit_pacts WHERE id = ?').run(pactId);
  });
}

function getActiveParticipants(pactId) {
  return db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND status = 'active' AND user_id IS NOT NULL
  `).all(pactId);
}

function getActivePartnerCount(pactId) {
  return db.prepare(`
    SELECT COUNT(*) c FROM pact_participants WHERE pact_id = ? AND status = 'active' AND is_creator = 0
  `).get(pactId).c;
}

// Activates once start_date has arrived AND at least one partner has
// accepted. Never auto-cancels — stays pending until the creator cancels
// it (POST /:id/cancel) or a partner joins. Days generate from today, not
// the original start_date, so a late join doesn't rack up missed days.
function activatePactIfReady(pact) {
  if (pact.status !== 'pending_invite') return null;

  const today = todayInZone(pact.timezone);
  if (pact.start_date > today) return null;
  if (today > pact.end_date) return null;
  if (getActivePartnerCount(pact.id) === 0) return null;

  db.prepare(`UPDATE habit_pacts SET status = 'active' WHERE id = ?`).run(pact.id);
  generatePactDays({ ...pact, start_date: today });
  logEvent({ pactId: pact.id, eventType: 'pact_activated', payload: { effectiveStart: today } });
  return 'active';
}

// Splits a pool of cents evenly, assigning remainder deterministically.
function splitPoolCents(poolCents, completers) {
  const sorted = [...completers].sort((a, b) => a.user_id - b.user_id);
  const base = Math.floor(poolCents / sorted.length);
  const remainder = poolCents - base * sorted.length;
  return sorted.map((p, i) => ({ participant: p, cents: base + (i < remainder ? 1 : 0) }));
}

// Settles one day: missers owe their stake, completers split it evenly.
function settleDay(day, pact) {
  const participants = getActiveParticipants(pact.id);
  const checkIns = db.prepare('SELECT * FROM check_ins WHERE pact_day_id = ?').all(day.id);
  const checkedIn = new Set(checkIns.map((c) => c.user_id));

  const completers = participants.filter((p) => checkedIn.has(p.user_id));
  const failers = participants.filter((p) => !checkedIn.has(p.user_id));

  const stakeCents = pact.stake_amount * 100;
  const poolCents = failers.length * stakeCents;
  const canDistribute = completers.length > 0 && failers.length > 0;

  db.transaction(() => {
    db.prepare('DELETE FROM day_settlements WHERE pact_day_id = ?').run(day.id);
    const insert = db.prepare(`
      INSERT INTO day_settlements (pact_day_id, user_id, completed, amount_cents) VALUES (?, ?, ?, ?)
    `);

    if (canDistribute) {
      for (const { participant, cents } of splitPoolCents(poolCents, completers)) {
        insert.run(day.id, participant.user_id, 1, cents);
      }
    } else {
      for (const p of completers) insert.run(day.id, p.user_id, 1, 0);
    }
    for (const p of failers) {
      insert.run(day.id, p.user_id, 0, canDistribute ? -stakeCents : 0);
    }

    db.prepare(`UPDATE pact_days SET status = 'settled', processed_at = datetime('now') WHERE id = ?`).run(day.id);
  });

  logEvent({
    pactId: pact.id,
    pactDayId: day.id,
    eventType: 'day_settled',
    payload: {
      scheduledDate: day.scheduled_date,
      completedUserIds: completers.map((p) => p.user_id),
      missedUserIds: failers.map((p) => p.user_id),
    },
  });

  return { completers, failers };
}

// "Good news" push when a day resolves with nobody forfeiting.
function notifyDayOutcome(io, pact, day, completers, failers) {
  if (failers.length !== 0) return;
  for (const p of getActiveParticipants(pact.id)) {
    notifyUser(
      io,
      p.user_id,
      'pact_day_completed',
      { pactId: pact.id, habitDescription: pact.habit_description, scheduledDate: day.scheduled_date },
      { title: 'Bravo! 🎉', body: `Everyone kept up "${pact.habit_description}" for ${day.scheduled_date}.`, url: `/pacts/${pact.id}` }
    );
  }
}

// Cron entry point: activates ready pacts, settles due days, sends reminders.
function reconcileDue(io) {
  let activated = 0;

  const alreadyActivePacts = db.prepare(`SELECT * FROM habit_pacts WHERE status = 'active'`).all();

  const pendingInvitePacts = db.prepare(`SELECT * FROM habit_pacts WHERE status = 'pending_invite'`).all();
  for (const pact of pendingInvitePacts) {
    if (activatePactIfReady(pact) === 'active') activated++;
  }

  const settledCount = settleDueDaysForActivePacts(alreadyActivePacts, io);

  const reminded = sendDailyDebtReminders(io);
  return { activated, settledCount, reminded };
}

// On-demand settle for one pact (e.g. opening its page).
function settleDueDaysForPact(pact, io) {
  const today = todayInZone(pact.timezone);

  const dueDays = db.prepare(`
    SELECT * FROM pact_days WHERE pact_id = ? AND status = 'pending' AND scheduled_date < ?
  `).all(pact.id, today);

  for (const day of dueDays) {
    const { completers, failers } = settleDay(day, pact);
    if (io) {
      io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: failers.length === 0 ? 'day_completed' : 'day_missed' });
      notifyDayOutcome(io, pact, day, completers, failers);
    }
  }

  markCompletedIfNothingPending(pact, today);
  return dueDays.length;
}

function markCompletedIfNothingPending(pact, today) {
  if (pact.end_date >= today) return;
  const stillPending = db.prepare(`SELECT COUNT(*) c FROM pact_days WHERE pact_id = ? AND status = 'pending'`).get(pact.id).c;
  if (stillPending === 0) {
    db.prepare(`UPDATE habit_pacts SET status = 'completed' WHERE id = ?`).run(pact.id);
  }
}

// Batched: one query for all pending days across active pacts, instead of
// one query per pact. Grouped by each pact's own timezone-local "today".
function settleDueDaysForActivePacts(activePacts, io) {
  if (activePacts.length === 0) return 0;

  const placeholders = activePacts.map(() => '?').join(',');
  const allPending = db.prepare(`
    SELECT * FROM pact_days WHERE status = 'pending' AND pact_id IN (${placeholders})
  `).all(...activePacts.map((p) => p.id));

  const pendingByPact = new Map();
  for (const day of allPending) {
    if (!pendingByPact.has(day.pact_id)) pendingByPact.set(day.pact_id, []);
    pendingByPact.get(day.pact_id).push(day);
  }

  let settledCount = 0;
  for (const pact of activePacts) {
    const today = todayInZone(pact.timezone);
    const dueDays = (pendingByPact.get(pact.id) || []).filter((d) => d.scheduled_date < today);

    for (const day of dueDays) {
      const { completers, failers } = settleDay(day, pact);
      settledCount++;
      if (io) {
        io.to(`pact:${pact.id}`).emit('pact_update', { pactId: pact.id, type: failers.length === 0 ? 'day_completed' : 'day_missed' });
        notifyDayOutcome(io, pact, day, completers, failers);
      }
    }

    markCompletedIfNothingPending(pact, today);
  }

  return settledCount;
}

// Once-per-day debt nag, throttled via last_reminded_on.
function sendDailyDebtReminders(io) {
  const todayUtc = DateTime.utc().toISODate();
  const owed = db.prepare(`
    SELECT ds.*, pd.scheduled_date, hp.id as pact_id, hp.habit_description
    FROM day_settlements ds
    JOIN pact_days pd ON pd.id = ds.pact_day_id
    JOIN habit_pacts hp ON hp.id = pd.pact_id
    WHERE ds.amount_cents < 0 AND ds.settled = 0
      AND (ds.last_reminded_on IS NULL OR ds.last_reminded_on != ?)
  `).all(todayUtc);

  for (const row of owed) {
    db.prepare(`UPDATE day_settlements SET last_reminded_on = ? WHERE id = ?`).run(todayUtc, row.id);
    const amount = Math.abs(row.amount_cents) / 100;
    notifyUser(
      io,
      row.user_id,
      'debt_reminder',
      { settlementId: row.id, pactId: row.pact_id, habitDescription: row.habit_description, scheduledDate: row.scheduled_date, amount },
      { title: 'You owe a stake', body: `${amount} for missing "${row.habit_description}" on ${row.scheduled_date}.`, url: `/pacts/${row.pact_id}` }
    );
  }
  return owed.length;
}

// Creator cancels a pact that's still waiting on a partner.
function cancelPact(pact) {
  db.prepare(`UPDATE habit_pacts SET status = 'cancelled' WHERE id = ?`).run(pact.id);
  logEvent({ pactId: pact.id, eventType: 'pact_cancelled', payload: { reason: 'cancelled by creator' } });
}

module.exports = {
  todayInZone,
  generatePactDays,
  regenerateSchedule,
  reopenPact,
  deletePactCompletely,
  getActiveParticipants,
  getActivePartnerCount,
  activatePactIfReady,
  cancelPact,
  splitPoolCents,
  settleDay,
  settleDueDaysForPact,
  notifyDayOutcome,
  reconcileDue,
  sendDailyDebtReminders,
};
