const db = require('./db');

// Every meaningful state change in the app gets written here.
// The timeline UI is just this table rendered in order.
function logEvent({ pactId, cycleId = null, eventType, payload = {} }) {
  const stmt = db.prepare(`
    INSERT INTO events (pact_id, cycle_id, event_type, payload)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(pactId, cycleId, eventType, JSON.stringify(payload));
}

function getEventsForPact(pactId) {
  const rows = db.prepare(`
    SELECT * FROM events WHERE pact_id = ? ORDER BY created_at ASC, id ASC
  `).all(pactId);

  return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
}

module.exports = { logEvent, getEventsForPact };
