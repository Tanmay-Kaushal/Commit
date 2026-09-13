const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('./db');
const { logEvent } = require('./events');

// Looks at every active cycle whose end time has passed, decides whether each
// participant met their required check-ins, and closes the cycle out.
// processed_at guards against double-processing if this job somehow runs
// twice for the same cycle (e.g. after a crash + restart).
function reconcileCycles(io) {
  const now = DateTime.now().toUTC().toISO();

  const endedCycles = db.prepare(`
    SELECT * FROM habit_cycles
    WHERE status = 'active' AND cycle_end <= ? AND processed_at IS NULL
  `).all(now);

  for (const cycle of endedCycles) {
    const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(cycle.pact_id);
    if (!pact || pact.status !== 'active') continue;

    const checkIns = db.prepare('SELECT * FROM check_ins WHERE cycle_id = ?').all(cycle.id);
    const creatorCheckedIn = checkIns.some(c => c.user_id === pact.creator_id);
    const partnerCheckedIn = checkIns.some(c => c.user_id === pact.partner_id);

    // Simple rule for this version: each partner needs at least one check-in
    // logged during the cycle to be considered "on track" for that cycle.
    // (A more complete version would count check-ins against
    // frequency_per_week within the cycle rather than just "any at all".)
    const bothMet = creatorCheckedIn && partnerCheckedIn;
    const newStatus = bothMet ? 'completed' : 'forfeited';

    db.prepare(`
      UPDATE habit_cycles SET status = ?, processed_at = ? WHERE id = ?
    `).run(newStatus, DateTime.now().toUTC().toISO(), cycle.id);

    logEvent({
      pactId: pact.id,
      cycleId: cycle.id,
      eventType: bothMet ? 'cycle_completed' : 'cycle_forfeited',
      payload: { creatorCheckedIn, partnerCheckedIn },
    });

    if (io) {
      io.to(`pact:${pact.id}`).emit('pact_update', {
        pactId: pact.id,
        type: bothMet ? 'cycle_completed' : 'cycle_forfeited',
      });
    }
  }

  if (endedCycles.length > 0) {
    console.log(`[cron] reconciled ${endedCycles.length} cycle(s) at ${now}`);
  }
}

function startCronJob(io) {
  // Runs every minute — fine for local dev/demo. In production you'd probably
  // run this every 15-30 min via a real job queue instead of node-cron.
  cron.schedule('* * * * *', () => reconcileCycles(io));
  console.log('[cron] cycle reconciliation job scheduled (every minute)');
}

module.exports = { startCronJob, reconcileCycles };
