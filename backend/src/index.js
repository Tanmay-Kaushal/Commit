require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const pactRoutes = require('./routes/pacts');
const checkinRoutes = require('./routes/checkins');
const eventRoutes = require('./routes/events');
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
});

app.use('/api/auth', authRoutes);
app.use('/api/pacts', pactRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/events', eventRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Commit backend running on http://localhost:${PORT}`);
  startCronJob(io);
});
