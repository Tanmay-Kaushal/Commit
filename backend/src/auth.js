const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[auth] FATAL: JWT_SECRET is not set in production. Refusing to start.');
  process.exit(1);
}

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
