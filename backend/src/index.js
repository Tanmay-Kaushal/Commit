const path = require('path');
const fs = require('fs');
// Resolved relative to this file, not process.cwd() (run as `node backend/src/index.js` from repo root).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const pactRoutes = require('./routes/pacts');
const checkinRoutes = require('./routes/checkins');
const eventRoutes = require('./routes/events');
const friendRoutes = require('./routes/friends');
const debtRoutes = require('./routes/debts');
const inviteRoutes = require('./routes/invites');
const pushRoutes = require('./routes/push');
const db = require('./db');
const { verifyUser } = require('./auth');
const { getFriendInvitePreview, getPactInvitePreview } = require('./invitePreview');
const { startCronJob, stopCronJob } = require('./cronJob');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join_pact', (pactId) => {
    socket.join(`pact:${pactId}`);
  });

  // Verifies the token server-side so a client can't join someone else's room.
  socket.on('join_user', (token) => {
    try {
      const user = verifyUser(token);
      socket.join(`user:${user.id}`);
    } catch (err) {}
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pacts', pactRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/push', pushRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// backend/public exists after `npm run build` (see vite.config.ts).
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  // Link previews need real <meta> tags in the initial HTML (crawlers
  // don't run JS) — these two routes splice them in for /i and /p links.
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function withMetaTags(title, description) {
    const tags = [
      `<meta property="og:title" content="${escapeAttr(title)}">`,
      `<meta property="og:description" content="${escapeAttr(description)}">`,
      `<meta property="og:type" content="website">`,
      `<meta name="twitter:card" content="summary">`,
      `<meta name="twitter:title" content="${escapeAttr(title)}">`,
      `<meta name="twitter:description" content="${escapeAttr(description)}">`,
    ].join('\n    ');
    return indexHtml.replace('</head>', `    ${tags}\n  </head>`);
  }

  app.get('/i/:code', (req, res) => {
    const preview = getFriendInvitePreview(req.params.code);
    if (!preview) return res.send(indexHtml);
    const name = preview.username || preview.email;
    res.send(withMetaTags(`${name} has invited you on Commit`, 'Join them on Commit — habit accountability with a partner and a stake.'));
  });

  app.get('/p/:code', (req, res) => {
    const preview = getPactInvitePreview(req.params.code);
    if (!preview) return res.send(indexHtml);
    const name = preview.from?.username || preview.from?.email || 'Someone';
    res.send(withMetaTags(
      `${name} has invited you to a pact on Commit`,
      `${preview.habitDescription} — stake ${preview.stakeAmount} per missed day.`
    ));
  });

  app.use(express.static(publicDir));

  // SPA fallback so client-side routes survive a hard refresh.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('[auth] WARNING: GOOGLE_CLIENT_ID not set — nobody can sign in.');
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Commit backend running on http://localhost:${PORT}`);
  startCronJob(io);
});

// Graceful shutdown: stop new work, finish in-flight requests, checkpoint DB.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, closing down gracefully...`);

  stopCronJob();
  io.close();

  server.close(() => {
    db.checkpointAndClose();
    console.log('[shutdown] done');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[shutdown] timed out waiting for connections to close — forcing exit');
    db.checkpointAndClose();
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
