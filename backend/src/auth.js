const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { persistentDir } = require('./persistentDir');

// Uses JWT_SECRET if set; otherwise generates one and persists it to the
// attached volume so it survives restarts. Without a volume in
// production, a fresh secret every restart would log everyone out —
// refuse to start instead.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  const hasVolume = !!process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (process.env.NODE_ENV === 'production' && !hasVolume) {
    console.error('[auth] FATAL: no JWT_SECRET and no volume to persist an auto-generated one. Attach a Volume, or set JWT_SECRET manually.');
    process.exit(1);
  }

  const secretPath = path.join(persistentDir(), '.jwt-secret');
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();

  const generated = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  console.log('[auth] generated and persisted a new JWT_SECRET');
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// Cross-checks email baked into the token, not just id (ids can be reused after a DB reset).
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.email !== decoded.email) {
      return res.status(401).json({ error: 'Session no longer valid — please log in again' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Same as requireAuth, for the socket.io handshake (no req/res there).
function verifyUser(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  const user = db.prepare('SELECT id, email, username, timezone FROM users WHERE id = ?').get(decoded.id);
  if (!user || user.email !== decoded.email) {
    throw new Error('Session no longer valid');
  }
  return user;
}

module.exports = { signToken, requireAuth, verifyUser };
