const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Using Node's built-in SQLite module instead of a third-party package like
// better-sqlite3 on purpose — better-sqlite3 needs a native C++ build step
// (node-gyp + a C++ compiler), which fails out of the box on a lot of
// Windows machines unless Visual Studio's C++ tools are installed. node:sqlite
// ships with Node itself (22.5+), so `npm install` never needs to compile
// anything. It's still marked "experimental" by Node, but the API surface
// used here is stable.
const db = new DatabaseSync(path.join(__dirname, '..', 'dev.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habit_pacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    partner_id INTEGER,
    partner_email TEXT NOT NULL,
    habit_description TEXT NOT NULL,
    frequency_per_week INTEGER NOT NULL,
    stake_amount INTEGER NOT NULL,
    cycle_length_days INTEGER NOT NULL DEFAULT 7,
    status TEXT NOT NULL DEFAULT 'pending_invite',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (partner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS habit_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_id INTEGER NOT NULL,
    cycle_start TEXT NOT NULL,
    cycle_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_id) REFERENCES habit_pacts(id),
    UNIQUE(pact_id, cycle_start)
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'on_time',
    FOREIGN KEY (cycle_id) REFERENCES habit_cycles(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(cycle_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_id INTEGER NOT NULL,
    cycle_id INTEGER,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_id) REFERENCES habit_pacts(id),
    FOREIGN KEY (cycle_id) REFERENCES habit_cycles(id)
  );
`);

module.exports = db;
