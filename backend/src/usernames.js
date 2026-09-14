const db = require('./db');

function isUsernameTaken(username) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  return !!existing;
}

// Turns an email into a base handle, then appends random digits until it
// finds one that's free. e.g. "alice@test.com" -> "alice" -> "alice482".
function generateUsername(email) {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 15) || 'user';

  if (!isUsernameTaken(base)) {
    return base;
  }

  // try a handful of random suffixes before giving up and using a bigger one
  for (let i = 0; i < 20; i++) {
    const suffix = Math.floor(100 + Math.random() * 900); // 3 digits
    const candidate = `${base}${suffix}`;
    if (!isUsernameTaken(candidate)) {
      return candidate;
    }
  }

  // fallback: near-guaranteed unique with a longer random suffix
  return `${base}${Math.floor(Math.random() * 1000000)}`;
}

module.exports = { isUsernameTaken, generateUsername };
