// Single shape for the "current user" object sent to the frontend —
// used by auth.js (login/me) and settings.js (settings updates) so they
// can never drift out of sync with each other.
function serializeUser(row) {
  if (!row) return null;
  let notifyPrefs = {};
  try {
    notifyPrefs = JSON.parse(row.notify_prefs || '{}');
  } catch {
    notifyPrefs = {};
  }
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    timezone: row.timezone,
    theme: row.theme,
    currency: row.currency,
    weekStart: row.week_start,
    discoverable: !!row.discoverable,
    notifyPrefs,
  };
}

const USER_COLUMNS = 'id, email, username, timezone, theme, currency, week_start, notify_prefs, discoverable';

module.exports = { serializeUser, USER_COLUMNS };
