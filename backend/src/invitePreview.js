const db = require('./db');

// Public lookups for link previews and claim pages.
function getFriendInvitePreview(code) {
  const user = db.prepare('SELECT id, username, email FROM users WHERE invite_code = ? AND email_verified = 1').get(code);
  if (!user) return null;
  return { userId: user.id, username: user.username, email: user.email };
}

function getPactInvitePreview(code) {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE invite_code = ?').get(code);
  if (!pact) return null;
  if (!['pending_invite', 'active'].includes(pact.status)) return null;

  const creator = db.prepare(`
    SELECT u.id, u.username, u.email FROM pact_participants pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.pact_id = ? AND pp.is_creator = 1
  `).get(pact.id);

  return {
    pactId: pact.id,
    habitDescription: pact.habit_description,
    stakeAmount: pact.stake_amount,
    scheduledDays: pact.scheduled_days,
    startDate: pact.start_date,
    endDate: pact.end_date,
    isGroup: !!pact.is_group,
    from: creator ? { id: creator.id, username: creator.username, email: creator.email } : null,
  };
}

module.exports = { getFriendInvitePreview, getPactInvitePreview };
