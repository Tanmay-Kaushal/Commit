const { DateTime } = require('luxon');
const db = require('./db');

// Developer Mode lets someone testing the app fast-forward the clock the
// server uses for cycle math and the cron reconciliation job, so pacts with
// multi-day cycles can be tested without actually waiting for days to pass.
// The offset is a single global value (not per-user) since cycle windows
// and the cron job aren't scoped to one user's session — it's stored in
// app_config so it survives a server restart.
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const OFFSET_KEY = 'dev_time_offset_ms';

function getOffsetMs() {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(OFFSET_KEY);
  return row ? Number(row.value) : 0;
}

function setOffsetMs(offsetMs) {
  db.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(OFFSET_KEY, String(Math.round(offsetMs)));
}

// The simulated "now" — real time plus whatever offset developer mode has
// dialed in. Falls back to real time when no offset has ever been set.
function now() {
  return DateTime.now().plus({ milliseconds: getOffsetMs() });
}

function reset() {
  setOffsetMs(0);
}

module.exports = { now, getOffsetMs, setOffsetMs, reset };
