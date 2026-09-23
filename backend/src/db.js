const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { persistentDir } = require('./persistentDir');

// Refuse to start rather than silently lose data on redeploy. A volume
// attached in the Railway dashboard sets RAILWAY_VOLUME_MOUNT_PATH
// automatically, so DB_PATH itself doesn't need setting by hand.
if (!process.env.DB_PATH && !process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.NODE_ENV === 'production') {
  console.error('[db] FATAL: no DB_PATH and no volume attached. Attach a Volume in the Railway dashboard, or set DB_PATH manually.');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.join(persistentDir(), 'dev.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbExistedBefore = fs.existsSync(dbPath);
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA wal_autocheckpoint = 1000');
db.exec('PRAGMA cache_size = -4000'); // ~4MB

// Cache prepared statements by SQL text — avoids recompiling on every call.
const statementCache = new Map();
const rawPrepare = db.prepare.bind(db);
db.prepare = function prepareCached(sql) {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = rawPrepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    google_id TEXT UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    invite_code TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
  );

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

  CREATE TABLE IF NOT EXISTS habit_pacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    habit_description TEXT NOT NULL,
    stake_amount INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    is_group INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending_invite',
    invite_code TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

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

  CREATE TABLE IF NOT EXISTS pact_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_id) REFERENCES habit_pacts(id),
    UNIQUE(pact_id, scheduled_date)
  );

  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_day_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'on_time',
    FOREIGN KEY (pact_day_id) REFERENCES pact_days(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(pact_day_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_id INTEGER NOT NULL,
    pact_day_id INTEGER,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_id) REFERENCES habit_pacts(id),
    FOREIGN KEY (pact_day_id) REFERENCES pact_days(id)
  );

  CREATE TABLE IF NOT EXISTS day_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_day_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    settled INTEGER NOT NULL DEFAULT 0,
    settled_by INTEGER,
    settled_at TEXT,
    last_reminded_on TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pact_day_id) REFERENCES pact_days(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(pact_day_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pact_day_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (pact_day_id) REFERENCES pact_days(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Persisted notification inbox. Written alongside every existing
  -- notifyUser() call (see push.js) so the live socket popup and the
  -- /notifications page share one source of truth.
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    payload TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_habit_pacts_status ON habit_pacts(status);
  CREATE INDEX IF NOT EXISTS idx_pact_days_pact_status_date ON pact_days(pact_id, status, scheduled_date);
  CREATE INDEX IF NOT EXISTS idx_pact_participants_user ON pact_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_pact_participants_pact_status ON pact_participants(pact_id, status);
  CREATE INDEX IF NOT EXISTS idx_day_settlements_user_settled ON day_settlements(user_id, settled);
  CREATE INDEX IF NOT EXISTS idx_events_pact_created ON events(pact_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_addressee_status ON friend_requests(addressee_id, status);
  CREATE INDEX IF NOT EXISTS idx_disputes_pact_day ON disputes(pact_day_id);
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
`);

// Versioned schema migrations — future changes ALTER/rebuild, never lose data.
const CURRENT_SCHEMA_VERSION = 3;
const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;

// v2: password/email-verification columns replaced with google_id (Google
// sign-in only now). Rebuilds the users table, keeping every existing row
// (id, email, username, timezone, invite_code, created_at) — an existing
// account just needs to sign in with Google using the same email to link
// up; their pacts/friendships (which key off user id) are untouched.
if (schemaVersion < 2) {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (cols.some((c) => c.name === 'password_hash')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        google_id TEXT UNIQUE,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        invite_code TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, email, username, timezone, invite_code, created_at)
        SELECT id, email, username, timezone, invite_code, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      DROP TABLE IF EXISTS invite_emails_sent;
      DROP INDEX IF EXISTS idx_users_unverified;
    `);
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[db] migrated users table to schema v2 (Google sign-in)');
  }
}

// v3: settings columns on users (all additive — plain ALTER TABLE ADD
// COLUMN, no rebuild needed since nothing is removed or renamed).
if (schemaVersion < 3) {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes('theme')) db.exec(`ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`);
  if (!cols.includes('currency')) db.exec(`ALTER TABLE users ADD COLUMN currency TEXT NOT NULL DEFAULT '$'`);
  if (!cols.includes('week_start')) db.exec(`ALTER TABLE users ADD COLUMN week_start TEXT NOT NULL DEFAULT 'mon'`);
  if (!cols.includes('notify_prefs')) db.exec(`ALTER TABLE users ADD COLUMN notify_prefs TEXT NOT NULL DEFAULT '{}'`);
  if (!cols.includes('discoverable')) db.exec(`ALTER TABLE users ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1`);
  console.log('[db] migrated users table to schema v3 (settings columns)');
}

if (schemaVersion < CURRENT_SCHEMA_VERSION) {
  db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
console.log(
  `[db] using ${dbPath} (${dbExistedBefore ? 'existing file found' : 'created new file'}), schema v${CURRENT_SCHEMA_VERSION}, ${userCount} user(s)`
);

function checkpointAndClose() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.error('[db] checkpoint on shutdown failed:', err.message);
  }
  db.close();
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = db;
module.exports.checkpointAndClose = checkpointAndClose;
module.exports.transaction = transaction;
