const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { serializeUser, USER_COLUMNS } = require('../userSerializer');

const router = express.Router();
router.use(requireAuth);

const THEMES = ['light', 'dark', 'system'];
const WEEK_STARTS = ['mon', 'sun'];
const NOTIFY_KEYS = ['master', 'pact_invite', 'friend_request', 'pact_day_completed', 'debt_reminder', 'payment_received'];

router.get('/', (req, res) => {
  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json(serializeUser(user));
});

router.put('/', (req, res) => {
  const { theme, currency, weekStart, discoverable, notifyPrefs } = req.body;
  const current = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);

  let nextTheme = current.theme;
  if (theme !== undefined) {
    if (!THEMES.includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    nextTheme = theme;
  }

  let nextCurrency = current.currency;
  if (currency !== undefined) {
    const trimmed = String(currency).trim();
    if (!trimmed || trimmed.length > 4) {
      return res.status(400).json({ error: 'Currency symbol must be 1-4 characters' });
    }
    nextCurrency = trimmed;
  }

  let nextWeekStart = current.week_start;
  if (weekStart !== undefined) {
    if (!WEEK_STARTS.includes(weekStart)) return res.status(400).json({ error: 'Invalid week start' });
    nextWeekStart = weekStart;
  }

  let nextDiscoverable = current.discoverable;
  if (discoverable !== undefined) {
    nextDiscoverable = discoverable ? 1 : 0;
  }

  let nextNotifyPrefs = current.notify_prefs;
  if (notifyPrefs !== undefined) {
    if (typeof notifyPrefs !== 'object' || notifyPrefs === null || Array.isArray(notifyPrefs)) {
      return res.status(400).json({ error: 'notifyPrefs must be an object' });
    }
    const cleaned = {};
    for (const key of NOTIFY_KEYS) {
      if (key in notifyPrefs) cleaned[key] = !!notifyPrefs[key];
    }
    nextNotifyPrefs = JSON.stringify(cleaned);
  }

  db.prepare(
    'UPDATE users SET theme = ?, currency = ?, week_start = ?, discoverable = ?, notify_prefs = ? WHERE id = ?'
  ).run(nextTheme, nextCurrency, nextWeekStart, nextDiscoverable, nextNotifyPrefs, req.user.id);

  const updated = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json(serializeUser(updated));
});

module.exports = router;
