const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { notifyUser } = require('../push');

const router = express.Router();
router.use(requireAuth);

// The current user's accepted friends, with how many pacts they share —
// a single query with a correlated subquery, not an N+1 loop.
router.get('/', (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.email, u.username,
      (SELECT COUNT(DISTINCT pp1.pact_id)
       FROM pact_participants pp1
       JOIN pact_participants pp2 ON pp2.pact_id = pp1.pact_id
       WHERE pp1.user_id = ? AND pp2.user_id = u.id) as sharedPacts
    FROM friendships f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
    ORDER BY u.username ASC
  `).all(req.user.id, req.user.id);

  res.json(friends);
});

// Pending friend requests: ones sent to me, and ones I've sent that are
// still awaiting a response.
router.get('/requests', (req, res) => {
  const incoming = db.prepare(`
    SELECT fr.id, u.id as userId, u.email, u.username, fr.created_at
    FROM friend_requests fr
    JOIN users u ON u.id = fr.requester_id
    WHERE fr.addressee_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(req.user.id);

  const outgoing = db.prepare(`
    SELECT fr.id, u.id as userId, u.email, u.username, fr.created_at
    FROM friend_requests fr
    JOIN users u ON u.id = fr.addressee_id
    WHERE fr.requester_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(req.user.id);

  res.json({ incoming, outgoing });
});

// Send a friend request by email or username. The other person must
// accept it before they show up in either person's friends list.
router.post('/requests', (req, res) => {
  const { identifier } = req.body;
  if (!identifier || !identifier.trim()) {
    return res.status(400).json({ error: 'Enter an email or username' });
  }

  const value = identifier.trim().toLowerCase();
  // Username search respects `discoverable`; a direct email match always
  // works (you already know exactly who you're looking for).
  const addressee = db.prepare(
    'SELECT id, email, username FROM users WHERE email = ? OR (username = ? AND discoverable = 1)'
  ).get(value, value);

  if (!addressee) {
    return res.status(404).json({ error: 'No user found with that email or username' });
  }
  if (addressee.id === req.user.id) {
    return res.status(400).json({ error: "You can't add yourself as a friend" });
  }

  const alreadyFriends = db.prepare(
    'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
  ).get(req.user.id, addressee.id);
  if (alreadyFriends) {
    return res.status(409).json({ error: 'Already in your friends list' });
  }

  // If they already sent us a request, accept it instead of creating a
  // mirror-image duplicate request.
  const reverseRequest = db.prepare(`
    SELECT * FROM friend_requests WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
  `).get(addressee.id, req.user.id);

  if (reverseRequest) {
    acceptRequest(reverseRequest);
    return res.json({ status: 'accepted', friend: addressee });
  }

  try {
    const result = db.prepare(`
      INSERT INTO friend_requests (requester_id, addressee_id) VALUES (?, ?)
    `).run(req.user.id, addressee.id);

    const io = req.app.get('io');
    notifyUser(
      io,
      addressee.id,
      'friend_request',
      { id: result.lastInsertRowid, from: { id: req.user.id, email: req.user.email } },
      { title: 'New friend request', body: `${req.user.username || req.user.email} wants to be friends on Commit.`, url: '/dashboard' }
    );

    res.json({ status: 'pending', requestId: result.lastInsertRowid });
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Friend request already sent' });
    }
    throw err;
  }
});

function acceptRequest(request) {
  db.prepare(`UPDATE friend_requests SET status = 'accepted', resolved_at = datetime('now') WHERE id = ?`)
    .run(request.id);

  try {
    db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(
      request.requester_id,
      request.addressee_id
    );
  } catch (err) {}
  try {
    db.prepare('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)').run(
      request.addressee_id,
      request.requester_id
    );
  } catch (err) {}
}

router.post('/requests/:id/accept', (req, res) => {
  const request = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.addressee_id !== req.user.id) {
    return res.status(403).json({ error: 'This request is not for you' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'This request has already been resolved' });
  }

  acceptRequest(request);

  const io = req.app.get('io');
  io.to(`user:${request.requester_id}`).emit('friend_request_accepted', {
    by: { id: req.user.id, email: req.user.email },
  });

  res.json({ ok: true });
});

router.post('/requests/:id/reject', (req, res) => {
  const request = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.addressee_id !== req.user.id) {
    return res.status(403).json({ error: 'This request is not for you' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'This request has already been resolved' });
  }

  db.prepare(`UPDATE friend_requests SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?`)
    .run(request.id);

  res.json({ ok: true });
});

// Deletes both directions plus old friend_requests, so re-requesting later works.
router.delete('/:id', (req, res) => {
  const friendId = Number(req.params.id);

  const isFriend = db.prepare(
    'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
  ).get(req.user.id, friendId);
  if (!isFriend) {
    return res.status(404).json({ error: 'Not in your friends list' });
  }

  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(req.user.id, friendId);
  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, req.user.id);
  db.prepare(`
    DELETE FROM friend_requests
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).run(req.user.id, friendId, friendId, req.user.id);

  res.json({ ok: true });
});

module.exports = router;
