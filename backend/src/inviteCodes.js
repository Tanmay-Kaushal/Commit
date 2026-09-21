const crypto = require('crypto');
const db = require('./db');

// 8 URL-safe chars (48 bits) — collisions checked and retried.
function randomCode() {
  return crypto.randomBytes(6).toString('base64url');
}

function getOrCreateUserInviteCode(userId) {
  const existing = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(userId)?.invite_code;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(code, userId);
      return code;
    } catch (err) {
      if (!(err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message))) throw err;
    }
  }
  throw new Error('Could not generate a unique invite code');
}

function getOrCreatePactInviteCode(pactId) {
  const existing = db.prepare('SELECT invite_code FROM habit_pacts WHERE id = ?').get(pactId)?.invite_code;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      db.prepare('UPDATE habit_pacts SET invite_code = ? WHERE id = ?').run(code, pactId);
      return code;
    } catch (err) {
      if (!(err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message))) throw err;
    }
  }
  throw new Error('Could not generate a unique invite code');
}

module.exports = { getOrCreateUserInviteCode, getOrCreatePactInviteCode };
