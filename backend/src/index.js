require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const pactRoutes = require('./routes/pacts');
const checkinRoutes = require('./routes/checkins');
const eventRoutes = require('./routes/events');
const friendRoutes = require('./routes/friends');
const devRoutes = require('./routes/dev');
const { startCronJob } = require('./cronJob');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});
app.set('io', io);

io.on('connection', (socket) => {
  // Frontend joins a room per pact it's viewing so updates only go to
  // people who actually care about that pact.
  socket.on('join_pact', (pactId) => {
    socket.join(`pact:${pactId}`);
  });

  // Frontend also joins a room keyed to its own user id right after login,
  // so we can push things like "you were invited to a pact" or "you got a
  // friend request" straight to that person without a page reload.
  socket.on('join_user', (userId) => {
    socket.join(`user:${userId}`);
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pacts', pactRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dev', devRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// The frontend's `npm run build` (see vite.config.ts) outputs straight into
// backend/public, so a single Express process — and a single Railway
// service — can serve both the API and the compiled app. This directory
// only exists after that build has run (e.g. `npm run build` at the repo
// root), so local API-only development without it keeps working fine.
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  // Anything that isn't an API route falls through to the SPA's index.html
  // so client-side routes like /pacts/3 resolve correctly on a hard refresh.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Commit backend running on http://localhost:${PORT}`);
  startCronJob(io);
});
