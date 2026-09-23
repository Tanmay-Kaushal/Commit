import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import InviteLinkButton from '../components/InviteLinkButton';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SectionMenu from '../components/ui/SectionMenu';
import MenuItem from '../components/ui/MenuItem';
import client from '../api/client';
import { isPushSupported, getExistingSubscription, enableNotifications, disableNotifications } from '../push';

// Intl's own timezone list doesn't include "UTC" — without it explicitly
// added, a <select value="UTC"> (every account's default) has no matching
// <option>, and the browser silently falls back to selecting the first
// option in the list, which alphabetically is "Africa/Abidjan".
const COMMON_TIMEZONES = Intl.supportedValuesOf ? ['UTC', ...Intl.supportedValuesOf('timeZone')] : ['UTC'];

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

type PushUiState = 'unsupported' | 'checking' | 'off' | 'on' | 'busy';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pushState, setPushState] = useState<PushUiState>(isPushSupported() ? 'checking' : 'unsupported');
  const [pushError, setPushError] = useState('');

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription()
      .then((sub) => setPushState(sub ? 'on' : 'off'))
      .catch(() => setPushState('off'));
  }, []);

  async function handleTogglePush() {
    setPushError('');
    const previousState = pushState;
    setPushState('busy');
    try {
      if (previousState === 'on') {
        await disableNotifications();
        setPushState('off');
      } else {
        await enableNotifications();
        setPushState('on');
      }
    } catch (err: any) {
      setPushError(err.message || 'Could not update notification settings');
      setPushState(previousState);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      await updateProfile({ username, timezone });
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not update profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl text-[var(--ink)]">Your profile</h1>
          <SectionMenu label="Profile options">
            {(close) => (
              <>
                <MenuItem to="/settings" onClick={close}>
                  Notification settings
                </MenuItem>
                <MenuItem to="/settings" onClick={close}>
                  Privacy
                </MenuItem>
                <MenuItem to="/settings" danger onClick={close}>
                  Delete account
                </MenuItem>
              </>
            )}
          </SectionMenu>
        </div>

        <Card className="p-6 space-y-4 max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-[var(--graphite)] block mb-1">Email</label>
              <input
                value={user?.email || ''}
                disabled
                className="w-full border-2 border-[var(--line)] rounded-xl px-3 py-2 text-sm bg-[var(--line)] text-[var(--graphite)]"
              />
              <p className="text-xs text-[var(--graphite)] mt-1">Email can't be changed.</p>
            </div>

            <div>
              <label className="text-sm text-[var(--graphite)] block mb-1">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-[var(--graphite)]">Timezone</label>
                <button
                  type="button"
                  onClick={() => setTimezone(detectTimezone())}
                  className="text-xs text-[var(--ink)] underline hover:text-[var(--graphite)]"
                >
                  Detect automatically
                </button>
              </div>
              {COMMON_TIMEZONES.length > 0 ? (
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
                />
              )}
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
            {saved && <p className="text-emerald-600 dark:text-emerald-400 text-sm">Profile updated.</p>}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 mt-6 max-w-md">
          <p className="text-sm font-medium text-[var(--ink)] mb-1">Invite friends</p>
          <p className="text-xs text-[var(--graphite)] mb-3">
            Share your link — anyone who opens it becomes your friend on Commit automatically.
          </p>
          <InviteLinkButton
            label="Invite friends on Commit"
            fetchLink={async () => (await client.get('/invites/friend-link')).data.url}
            className="text-sm bg-[var(--ink)] text-[var(--paper)] rounded-full px-4 py-2 border-2 border-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
          />
        </Card>

        {pushState !== 'unsupported' && (
          <Card className="p-6 mt-6 max-w-md">
            <p className="text-sm font-medium text-[var(--ink)] mb-1">Notifications</p>
            <p className="text-xs text-[var(--graphite)] mb-3">
              Get a notification for pact invites, friend requests, and payments when Commit isn't open in front of you.
            </p>
            <Button variant="secondary" size="sm" onClick={handleTogglePush} disabled={pushState === 'checking' || pushState === 'busy'}>
              {pushState === 'checking' && 'Checking...'}
              {pushState === 'busy' && 'Working...'}
              {pushState === 'on' && 'Disable notifications'}
              {pushState === 'off' && 'Enable notifications'}
            </Button>
            {pushError && <p className="text-red-600 dark:text-red-400 text-xs mt-2">{pushError}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}
