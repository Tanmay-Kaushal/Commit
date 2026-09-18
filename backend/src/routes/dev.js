const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const devTime = require('../devTime');

const router = express.Router();
router.use(requireAuth);

// Only someone who has Developer Mode turned on for their own account (see
// PUT /api/auth/me) is allowed to move the simulated clock. The clock
// itself is global (see devTime.js) since cycle math and the cron job
// aren't scoped to one user's session.
function requireDevMode(req, res, next) {
  const user = db.prepare('SELECT dev_mode_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user?.dev_mode_enabled) {
    return res.status(403).json({ error: 'Developer mode is not enabled for your account' });
  }
  next();
}

router.get('/status', (req, res) => {
  const user = db.prepare('SELECT dev_mode_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json({
    devModeEnabled: !!user?.dev_mode_enabled,
    offsetMs: devTime.getOffsetMs(),
    simulatedTime: devTime.now().toISO(),
  });
});

// Set the simulated clock to a specific date/time.
router.post('/set-time', requireDevMode, (req, res) => {
  const { isoDateTime } = req.body;
  if (!isoDateTime) return res.status(400).json({ error: 'isoDateTime is required' });

  const target = new Date(isoDateTime);
  if (Number.isNaN(target.getTime())) {
    return res.status(400).json({ error: 'Invalid date/time' });
  }

  devTime.setOffsetMs(target.getTime() - Date.now());
  res.json({ offsetMs: devTime.getOffsetMs(), simulatedTime: devTime.now().toISO() });
});

// Nudge the simulated clock forward/back by a number of days — handy for
// jumping straight past a pact's cycle length.
router.post('/advance', requireDevMode, (req, res) => {
  const { days = 0, hours = 0, minutes = 0 } = req.body;
  const ms = (Number(days) * 24 * 60 + Number(hours) * 60 + Number(minutes)) * 60 * 1000;
  devTime.setOffsetMs(devTime.getOffsetMs() + ms);
  res.json({ offsetMs: devTime.getOffsetMs(), simulatedTime: devTime.now().toISO() });
});

router.post('/reset', requireDevMode, (req, res) => {
  devTime.reset();
  res.json({ offsetMs: 0, simulatedTime: devTime.now().toISO() });
});

module.exports = router;
