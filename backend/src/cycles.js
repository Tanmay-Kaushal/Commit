const { DateTime } = require('luxon');
const db = require('./db');
const { logEvent } = require('./events');
const devTime = require('./devTime');

// Figures out the current cycle window for a pact, based on the creator's
// timezone. Not bulletproof for every edge case (e.g. if partner is in a
// wildly different timezone the "day" boundary favors the creator) but
// good enough for normal use.
//
// referenceTime defaults to devTime.now() rather than the real clock, so
// that Developer Mode's simulated time (see devTime.js) flows through to
// cycle math without every caller having to know about it.
function getCurrentCycleWindow(pact, referenceTime = devTime.now()) {
  const creator = db.prepare('SELECT * FROM users WHERE id = ?').get(pact.creator_id);
  const tz = creator?.timezone || 'UTC';

  const created = DateTime.fromSQL(pact.created_at, { zone: 'utc' }).setZone(tz);
  const now = referenceTime.setZone(tz);

  const cycleLengthDays = pact.cycle_length_days;
  const daysSinceStart = Math.floor(now.diff(created, 'days').days);
  const cycleIndex = Math.floor(daysSinceStart / cycleLengthDays);

  const cycleStart = created.plus({ days: cycleIndex * cycleLengthDays }).startOf('day');
  const cycleEnd = cycleStart.plus({ days: cycleLengthDays });

  return {
    cycleStart: cycleStart.toUTC().toISO(),
    cycleEnd: cycleEnd.toUTC().toISO(),
  };
}

// Gets or creates the HabitCycle row for "right now" for a given pact.
function getOrCreateCurrentCycle(pact) {
  const { cycleStart, cycleEnd } = getCurrentCycleWindow(pact);

  let cycle = db.prepare(
    'SELECT * FROM habit_cycles WHERE pact_id = ? AND cycle_start = ?'
  ).get(pact.id, cycleStart);

  if (!cycle) {
    const result = db.prepare(`
      INSERT INTO habit_cycles (pact_id, cycle_start, cycle_end, status)
      VALUES (?, ?, ?, 'active')
    `).run(pact.id, cycleStart, cycleEnd);

    cycle = db.prepare('SELECT * FROM habit_cycles WHERE id = ?').get(result.lastInsertRowid);

    logEvent({
      pactId: pact.id,
      cycleId: cycle.id,
      eventType: 'cycle_started',
      payload: { cycleStart, cycleEnd },
    });
  }

  return cycle;
}

function getActiveParticipants(pactId) {
  return db.prepare(`
    SELECT * FROM pact_participants WHERE pact_id = ? AND status = 'active' AND user_id IS NOT NULL
  `).all(pactId);
}

// Works out who completed a closed cycle and who didn't, then splits the
// forfeited stakes evenly among whoever did complete it: everyone who
// missed it owes their full stake into a pool, and that pool is divided
// equally across everyone who didn't. If everyone completed (nothing to
// redistribute) or everyone forfeited (no one to receive it), no money
// moves. Safe to call again for the same cycle (e.g. after a dispute is
// approved) — it just recomputes and overwrites the settlement rows.
function settleCycle(cycle, pact) {
  const participants = getActiveParticipants(pact.id);
  const checkIns = db.prepare('SELECT * FROM check_ins WHERE cycle_id = ?').all(cycle.id);
  const checkedInUserIds = new Set(checkIns.map((c) => c.user_id));

  const completers = participants.filter((p) => checkedInUserIds.has(p.user_id));
  const failers = participants.filter((p) => !checkedInUserIds.has(p.user_id));

  const stake = pact.stake_amount;
  const pool = failers.length * stake;
  const perCompleterShare = completers.length > 0 ? pool / completers.length : 0;
  const canDistribute = completers.length > 0 && failers.length > 0;

  db.prepare('DELETE FROM cycle_settlements WHERE cycle_id = ?').run(cycle.id);

  const insert = db.prepare(`
    INSERT INTO cycle_settlements (cycle_id, user_id, completed, amount)
    VALUES (?, ?, ?, ?)
  `);

  for (const p of completers) {
    insert.run(cycle.id, p.user_id, 1, canDistribute ? perCompleterShare : 0);
  }
  for (const p of failers) {
    insert.run(cycle.id, p.user_id, 0, canDistribute ? -stake : 0);
  }

  const newStatus = failers.length === 0 ? 'completed' : 'forfeited';
  db.prepare(`
    UPDATE habit_cycles SET status = ?, processed_at = ? WHERE id = ?
  `).run(newStatus, DateTime.now().toUTC().toISO(), cycle.id);

  logEvent({
    pactId: pact.id,
    cycleId: cycle.id,
    eventType: 'cycle_settled',
    payload: {
      completedUserIds: completers.map((p) => p.user_id),
      forfeitedUserIds: failers.map((p) => p.user_id),
      perCompleterShare,
    },
  });

  return { status: newStatus, completers, failers };
}

// Bravo popup: pushes a live "you completed the pact" notification straight
// to every active participant, independent of whether they're currently
// looking at the pact page (unlike the pact:<id> room updates, which only
// reach people already viewing it).
function notifyCycleOutcome(io, pact, status) {
  if (!io || status !== 'completed') return;
  const participants = getActiveParticipants(pact.id);
  for (const p of participants) {
    if (p.user_id) {
      io.to(`user:${p.user_id}`).emit('pact_completed', {
        pactId: pact.id,
        habitDescription: pact.habit_description,
      });
    }
  }
}

module.exports = {
  getCurrentCycleWindow,
  getOrCreateCurrentCycle,
  getActiveParticipants,
  settleCycle,
  notifyCycleOutcome,
};
