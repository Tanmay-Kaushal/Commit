import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import InviteLinkButton from '../components/InviteLinkButton';
import client from '../api/client';
import { isPushSupported, getExistingSubscription, enableNotifications, disableNotifications } from '../push';

const COMMON_TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];

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
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-6">Your profile</h1>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 space-y-4 max-w-md"
        >
          <div>
            <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Email</label>
            <input
              value={user?.email || ''}
              disabled
              className="w-full border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500"
            />
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Email can't be changed.</p>
          </div>

          <div>
            <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Timezone</label>
            {COMMON_TIMEZONES.length > 0 ? (
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 dark:text-stone-100"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            ) : (
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
              />
            )}
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-emerald-600 dark:text-emerald-400 text-sm">Profile updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mt-6 max-w-md">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Invite friends</p>
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
            Share your link — anyone who opens it becomes your friend on Commit automatically.
          </p>
          <InviteLinkButton
            label="Invite friends on Commit"
            fetchLink={async () => (await client.get('/invites/friend-link')).data.url}
            className="text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40"
          />
        </div>

        {pushState !== 'unsupported' && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mt-6 max-w-md">
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-1">Notifications</p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
              Get a notification for pact invites, friend requests, and payments when Commit isn't open in front of you.
            </p>
            <button
              onClick={handleTogglePush}
              disabled={pushState === 'checking' || pushState === 'busy'}
              className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-4 py-2 hover:bg-stone-300 dark:hover:bg-stone-600 transition disabled:opacity-40"
            >
              {pushState === 'checking' && 'Checking...'}
              {pushState === 'busy' && 'Working...'}
              {pushState === 'on' && 'Disable notifications'}
              {pushState === 'off' && 'Enable notifications'}
            </button>
            {pushError && <p className="text-red-600 dark:text-red-400 text-xs mt-2">{pushError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
