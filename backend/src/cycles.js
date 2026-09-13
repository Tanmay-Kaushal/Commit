const { DateTime } = require('luxon');
const db = require('./db');
const { logEvent } = require('./events');

// Figures out the current cycle window for a pact, based on the creator's
// timezone. Not bulletproof for every edge case (e.g. if partner is in a
// wildly different timezone the "day" boundary favors the creator) but
// good enough for normal use.
function getCurrentCycleWindow(pact, referenceTime = DateTime.now()) {
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

module.exports = { getCurrentCycleWindow, getOrCreateCurrentCycle };
