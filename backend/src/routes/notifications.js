const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function serialize(row) {
  let payload = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    payload,
    read: !!row.read_at,
    createdAt: row.created_at,
  };
}

// Most recent first, capped — this is an inbox, not an archive browser.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(req.user.id);
  res.json(rows.map(serialize));
});

router.get('/unread-count', (req, res) => {
  const { count } = db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(req.user.id);
  res.json({ count });
});

router.post('/:id/read', (req, res) => {
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!notification || notification.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  if (!notification.read_at) {
    db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).run(notification.id);
  }
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).run(
    req.user.id
  );
  res.json({ ok: true });
});

module.exports = router;
