const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Using Node's built-in SQLite module instead of a third-party package like
// better-sqlite3 on purpose — better-sqlite3 needs a native C++ build step
// (node-gyp + a C++ compiler), which fails out of the box on a lot of
// Windows machines unless Visual Studio's C++ tools are installed. node:sqlite
// ships with Node itself (22.5+), so `npm install` never needs to compile
// anything. It's still marked "experimental" by Node, but the API surface
// used here is stable.
// DB_PATH lets this point at a mounted Railway Volume in production (e.g.
// /data/dev.db) so the database survives redeploys — Railway's regular
// filesystem is wiped on every deploy. Defaults to the local dev.db file
// for local development.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dev.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
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

  -- One row per direction: if A adds B, that's a row (A, B). Only created
  -- (both directions at once) once a friend_request has been accepted.
  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
  );

  -- A pending ask to become friends. Accepting one writes both directions
  -- into friendships; rejecting just closes it out.
  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    addressee_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (addressee_id) REFERENCES users(id),
    UNIQUE(requester_id, addressee_id)
  );

  -- Every participant in a pact, including the creator, gets a row here.
  -- This is what lets a pact have more than one partner: check-ins,
  -- acceptance, and settlement all key off this table instead of the
  -- legacy creator_id/partner_id columns on habit_pacts.
  CREATE TABLE IF NOT EXISTS pact_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_id INTEGER NOT NULL,
    user_id INTEGER,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_invite',
    is_creator INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_id) REFERENCES habit_pacts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(pact_id, email)
  );

  -- Per-participant, per-cycle money movement once a cycle closes.
  -- amount is positive for someone who completed and received a share of
  -- the pooled stakes, negative for someone who forfeited and owes their
  -- stake. settled_* flags let either the payer or a receiver confirm the
  -- money actually changed hands.
  CREATE TABLE IF NOT EXISTS cycle_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    settled INTEGER NOT NULL DEFAULT 0,
    settled_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cycle_id) REFERENCES habit_cycles(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(cycle_id, user_id)
  );

  -- A participant claiming "I did complete this cycle, I just forgot to
  -- log it" after being marked as forfeited. Any other active participant
  -- can resolve it.
  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (cycle_id) REFERENCES habit_cycles(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(cycle_id, user_id)
  );
`);

// Lightweight migration for anyone running against an older dev.db that
// doesn't have the username column yet (SQLite has no "ADD COLUMN IF NOT
// EXISTS", so we check first).
const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasUsername = userColumns.some((col) => col.name === 'username');
if (!hasUsername) {
  db.exec('ALTER TABLE users ADD COLUMN username TEXT');
}

// Same idea for is_group on habit_pacts, for anyone running against an
// older dev.db.
const pactColumns = db.prepare("PRAGMA table_info(habit_pacts)").all();
const hasIsGroup = pactColumns.some((col) => col.name === 'is_group');
if (!hasIsGroup) {
  db.exec("ALTER TABLE habit_pacts ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0");
}

// v1.2: Developer Mode toggle, per user, gating who's allowed to move the
// simulated clock used for cycle testing.
const hasDevMode = userColumns.some((col) => col.name === 'dev_mode_enabled');
if (!hasDevMode) {
  db.exec('ALTER TABLE users ADD COLUMN dev_mode_enabled INTEGER NOT NULL DEFAULT 0');
}

// Backfill pact_participants for any pacts created before that table
// existed, so old pacts keep working under the new participant-based logic.
const legacyPacts = db.prepare(`
  SELECT * FROM habit_pacts
  WHERE id NOT IN (SELECT DISTINCT pact_id FROM pact_participants)
`).all();
for (const pact of legacyPacts) {
  const creator = db.prepare('SELECT email FROM users WHERE id = ?').get(pact.creator_id);
  try {
    db.prepare(`
      INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator)
      VALUES (?, ?, ?, 'active', 1)
    `).run(pact.id, pact.creator_id, creator?.email || '');
  } catch (err) {}
  try {
    db.prepare(`
      INSERT INTO pact_participants (pact_id, user_id, email, status, is_creator)
      VALUES (?, ?, ?, ?, 0)
    `).run(
      pact.id,
      pact.partner_id,
      pact.partner_email,
      pact.partner_id ? 'active' : 'pending_invite'
    );
  } catch (err) {}
}

module.exports = db;
