const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { pushConfigured } = require('../push');

const router = express.Router();

// Public — the frontend needs this before the person has even logged in
// to know whether to offer the "enable notifications" control at all.
router.get('/vapid-public-key', (req, res) => {
  if (!pushConfigured()) return res.json({ key: null });
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.use(requireAuth);

router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid push subscription' });
  }

  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(req.user.id, endpoint, keys.p256dh, keys.auth);

  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
