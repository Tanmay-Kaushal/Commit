const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('./db');
const { settleCycle } = require('./cycles');

// Looks at every active cycle whose end time has passed, decides who
// completed it and who didn't (any number of participants), settles the
// stakes between them, and closes the cycle out. processed_at guards
// against double-processing if this job somehow runs twice for the same
// cycle (e.g. after a crash + restart).
function reconcileCycles(io) {
  const now = DateTime.now().toUTC().toISO();

  const endedCycles = db.prepare(`
    SELECT * FROM habit_cycles
    WHERE status = 'active' AND cycle_end <= ? AND processed_at IS NULL
  `).all(now);

  for (const cycle of endedCycles) {
    const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(cycle.pact_id);
    if (!pact || pact.status !== 'active') continue;

    const { status } = settleCycle(cycle, pact);

    if (io) {
      io.to(`pact:${pact.id}`).emit('pact_update', {
        pactId: pact.id,
        type: status === 'completed' ? 'cycle_completed' : 'cycle_forfeited',
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
