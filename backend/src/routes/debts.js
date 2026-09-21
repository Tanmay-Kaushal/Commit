const express = require('express');
const { DateTime } = require('luxon');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Every unsettled debt owed by/to the current user, across all their pacts.
router.get('/', (req, res) => {
  const todayUtc = DateTime.utc().toISODate();

  const owedByMe = db.prepare(`
    SELECT ds.id as settlementId, hp.id as pactId, hp.habit_description as habitDescription,
           pd.scheduled_date as scheduledDate, ds.amount_cents as amountCents,
           ds.settled, ds.last_reminded_on
    FROM day_settlements ds
    JOIN pact_days pd ON pd.id = ds.pact_day_id
    JOIN habit_pacts hp ON hp.id = pd.pact_id
    WHERE ds.user_id = ? AND ds.amount_cents < 0 AND ds.settled = 0
    ORDER BY pd.scheduled_date ASC
  `).all(req.user.id).map((r) => ({
    settlementId: r.settlementId,
    pactId: r.pactId,
    habitDescription: r.habitDescription,
    scheduledDate: r.scheduledDate,
    amount: Math.abs(r.amountCents) / 100,
    shouldNagNow: r.last_reminded_on !== todayUtc,
  }));

  const owedToMe = db.prepare(`
    SELECT ds.id as settlementId, hp.id as pactId, hp.habit_description as habitDescription,
           pd.scheduled_date as scheduledDate, ds.amount_cents as amountCents, ds.settled
    FROM day_settlements ds
    JOIN pact_days pd ON pd.id = ds.pact_day_id
    JOIN habit_pacts hp ON hp.id = pd.pact_id
    WHERE ds.user_id = ? AND ds.amount_cents > 0
    ORDER BY pd.scheduled_date DESC
    LIMIT 50
  `).all(req.user.id).map((r) => ({
    settlementId: r.settlementId,
    pactId: r.pactId,
    habitDescription: r.habitDescription,
    scheduledDate: r.scheduledDate,
    amount: r.amountCents / 100,
    settled: !!r.settled,
  }));

  const totalOwedByMe = owedByMe.reduce((sum, d) => sum + d.amount, 0);
  const totalOwedToMe = owedToMe.filter((d) => !d.settled).reduce((sum, d) => sum + d.amount, 0);

  res.json({ owedByMe, owedToMe, totalOwedByMe, totalOwedToMe });
});

// Stamps "already nagged today" so the reminder doesn't repeat until tomorrow.
router.post('/:settlementId/ack-reminder', (req, res) => {
  const todayUtc = DateTime.utc().toISODate();
  const settlement = db.prepare('SELECT * FROM day_settlements WHERE id = ?').get(req.params.settlementId);
  if (!settlement) return res.status(404).json({ error: 'Settlement not found' });
  if (settlement.user_id !== req.user.id) return res.status(403).json({ error: 'Not your debt' });

  db.prepare('UPDATE day_settlements SET last_reminded_on = ? WHERE id = ?').run(todayUtc, settlement.id);
  res.json({ ok: true });
});

module.exports = router;
