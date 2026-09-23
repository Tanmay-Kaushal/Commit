const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// All of this is derived from existing tables — no stats table to keep in
// sync, just a handful of queries run when the Achievements page loads.
function computeStats(userId) {
  const totalCheckins = db.prepare('SELECT COUNT(*) c FROM check_ins WHERE user_id = ?').get(userId).c;

  const settlementRows = db
    .prepare(
      `SELECT ds.completed, ds.amount_cents, ds.settled, pd.scheduled_date, hp.id as pact_id
       FROM day_settlements ds
       JOIN pact_days pd ON pd.id = ds.pact_day_id
       JOIN habit_pacts hp ON hp.id = pd.pact_id
       WHERE ds.user_id = ?
       ORDER BY pd.scheduled_date ASC`
    )
    .all(userId);

  const totalScheduledDays = settlementRows.length;
  const completedDays = settlementRows.filter((r) => r.completed).length;
  const completionPct = totalScheduledDays > 0 ? Math.round((completedDays / totalScheduledDays) * 100) : null;

  // A calendar day only counts as "good" if every pact due that day was
  // completed — a streak shouldn't look perfect if one of several pacts
  // was missed on the same date.
  const byDate = new Map();
  for (const row of settlementRows) {
    const entry = byDate.get(row.scheduled_date) || { completed: true };
    entry.completed = entry.completed && !!row.completed;
    byDate.set(row.scheduled_date, entry);
  }
  const orderedDates = [...byDate.keys()].sort();

  let longestStreak = 0;
  let runningStreak = 0;
  for (const date of orderedDates) {
    if (byDate.get(date).completed) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }
  // Current streak: walk back from the most recent day while it's completed.
  let currentStreak = 0;
  for (let i = orderedDates.length - 1; i >= 0; i--) {
    if (byDate.get(orderedDates[i]).completed) currentStreak += 1;
    else break;
  }

  const moneyWonCents = settlementRows.filter((r) => r.amount_cents > 0).reduce((s, r) => s + r.amount_cents, 0);
  const moneyLostCents = settlementRows
    .filter((r) => r.amount_cents < 0)
    .reduce((s, r) => s + Math.abs(r.amount_cents), 0);
  const moneyOutstandingCents = settlementRows
    .filter((r) => r.amount_cents < 0 && !r.settled)
    .reduce((s, r) => s + Math.abs(r.amount_cents), 0);

  const pactsCompleted = db
    .prepare(
      `SELECT COUNT(DISTINCT hp.id) c
       FROM pact_participants pp
       JOIN habit_pacts hp ON hp.id = pp.pact_id
       WHERE pp.user_id = ? AND hp.status = 'closed'`
    )
    .get(userId).c;

  const friendsCount = db.prepare('SELECT COUNT(*) c FROM friendships WHERE user_id = ?').get(userId).c;

  const hasGroupPact = db
    .prepare(
      `SELECT 1
       FROM pact_participants pp
       JOIN habit_pacts hp ON hp.id = pp.pact_id
       WHERE pp.user_id = ? AND hp.is_group = 1 LIMIT 1`
    )
    .get(userId);

  const hasDisputeWon = db.prepare(`SELECT 1 FROM disputes WHERE user_id = ? AND status = 'approved' LIMIT 1`).get(userId);

  // A pact only counts as "perfect" if the user had at least one scheduled
  // day in it and completed every single one.
  const perfectPactCounts = new Map();
  for (const row of settlementRows) {
    const entry = perfectPactCounts.get(row.pact_id) || { total: 0, completed: 0 };
    entry.total += 1;
    if (row.completed) entry.completed += 1;
    perfectPactCounts.set(row.pact_id, entry);
  }
  const closedPactIds = new Set(
    db
      .prepare(
        `SELECT hp.id FROM pact_participants pp JOIN habit_pacts hp ON hp.id = pp.pact_id
         WHERE pp.user_id = ? AND hp.status = 'closed'`
      )
      .all(userId)
      .map((r) => r.id)
  );
  const hasPerfectPact = [...perfectPactCounts.entries()].some(
    ([pactId, v]) => closedPactIds.has(pactId) && v.total > 0 && v.total === v.completed
  );

  return {
    totalCheckins,
    completionPct,
    currentStreak,
    longestStreak,
    moneyWon: moneyWonCents / 100,
    moneyLost: moneyLostCents / 100,
    moneyOutstanding: moneyOutstandingCents / 100,
    pactsCompleted,
    friendsCount,
    hasGroupPact: !!hasGroupPact,
    hasDisputeWon: !!hasDisputeWon,
    hasPerfectPact,
    isDebtFree: moneyOutstandingCents === 0,
  };
}

const ACHIEVEMENTS = [
  { id: 'first_checkin', label: 'First check-in', description: 'Check in once.', test: (s) => s.totalCheckins >= 1, progress: (s) => [Math.min(s.totalCheckins, 1), 1] },
  { id: 'streak_7', label: '7-day streak', description: 'Complete every scheduled day for 7 days in a row.', test: (s) => s.longestStreak >= 7, progress: (s) => [Math.min(s.longestStreak, 7), 7] },
  { id: 'streak_30', label: '30-day streak', description: 'Complete every scheduled day for 30 days in a row.', test: (s) => s.longestStreak >= 30, progress: (s) => [Math.min(s.longestStreak, 30), 30] },
  { id: 'checkins_50', label: '50 check-ins', description: 'Check in 50 times, all-time.', test: (s) => s.totalCheckins >= 50, progress: (s) => [Math.min(s.totalCheckins, 50), 50] },
  { id: 'first_pact_done', label: 'First pact finished', description: 'Complete a pact from start to close.', test: (s) => s.pactsCompleted >= 1, progress: (s) => [Math.min(s.pactsCompleted, 1), 1] },
  { id: 'perfect_pact', label: 'Perfect pact', description: 'Finish a pact with zero missed days.', test: (s) => s.hasPerfectPact, progress: (s) => [s.hasPerfectPact ? 1 : 0, 1] },
  { id: 'five_friends', label: '5 friends', description: 'Have 5 friends on Commit.', test: (s) => s.friendsCount >= 5, progress: (s) => [Math.min(s.friendsCount, 5), 5] },
  { id: 'debt_free', label: 'Debt-free', description: 'Have no outstanding stake owed.', test: (s) => s.isDebtFree, progress: (s) => [s.isDebtFree ? 1 : 0, 1] },
  { id: 'group_pact', label: 'Group pact', description: 'Join a pact with more than one other partner.', test: (s) => s.hasGroupPact, progress: (s) => [s.hasGroupPact ? 1 : 0, 1] },
  { id: 'dispute_won', label: 'Dispute won', description: 'Win a dispute over a missed day.', test: (s) => s.hasDisputeWon, progress: (s) => [s.hasDisputeWon ? 1 : 0, 1] },
];

router.get('/', (req, res) => {
  const stats = computeStats(req.user.id);
  const achievements = ACHIEVEMENTS.map((a) => {
    const [current, target] = a.progress(stats);
    return { id: a.id, label: a.label, description: a.description, unlocked: a.test(stats), progress: { current, target } };
  });
  res.json({ stats, achievements });
});

module.exports = router;
