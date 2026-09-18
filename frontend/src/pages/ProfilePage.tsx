import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import client from '../api/client';

const COMMON_TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no offset/zone info.
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Developer mode: lets someone testing the app move the server's
  // simulated clock forward, so multi-day pact cycles can be reconciled
  // without actually waiting for days to pass.
  const [devModeEnabled, setDevModeEnabled] = useState(!!user?.devModeEnabled);
  const [devToggleBusy, setDevToggleBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState('');
  const [simulatedTime, setSimulatedTime] = useState<string | null>(null);
  const [timeInput, setTimeInput] = useState('');

  // The auth user (persisted to localStorage) is the source of truth. If it
  // ever changes — including from an in-flight PUT resolving after a newer
  // one — the checkbox follows it, instead of drifting out of sync with
  // whatever was last optimistically set locally.
  useEffect(() => {
    setDevModeEnabled(!!user?.devModeEnabled);
  }, [user?.devModeEnabled]);

  // Guards against out-of-order responses: if two toggle requests are ever
  // in flight (shouldn't happen now that the checkbox disables itself while
  // busy, but keep this as a second line of defense), only the response to
  // the most recently issued request is allowed to touch state.
  const toggleRequestId = useRef(0);

  async function loadDevStatus() {
    try {
      const res = await client.get('/dev/status');
      setSimulatedTime(res.data.simulatedTime);
      setTimeInput(toLocalInputValue(res.data.simulatedTime));
    } catch {
      // best-effort — profile still usable without this
    }
  }

  useEffect(() => {
    if (devModeEnabled) loadDevStatus();
  }, [devModeEnabled]);

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

  async function handleToggleDevMode(next: boolean) {
    setDevError('');
    setDevModeEnabled(next);
    setDevToggleBusy(true);
    const requestId = ++toggleRequestId.current;
    try {
      await updateProfile({ devModeEnabled: next });
      // A newer toggle has since been issued — that request now owns the
      // checkbox's state, so don't touch anything on this one's resolution.
      if (requestId !== toggleRequestId.current) return;
    } catch (err: any) {
      if (requestId !== toggleRequestId.current) return;
      setDevModeEnabled(!next);
      setDevError(err.response?.data?.error || 'Could not update developer mode');
    } finally {
      if (requestId === toggleRequestId.current) setDevToggleBusy(false);
    }
  }

  async function handleSetTime(e: React.FormEvent) {
    e.preventDefault();
    setDevError('');
    setDevBusy(true);
    try {
      const res = await client.post('/dev/set-time', { isoDateTime: timeInput });
      setSimulatedTime(res.data.simulatedTime);
    } catch (err: any) {
      setDevError(err.response?.data?.error || 'Could not set the simulated time');
    } finally {
      setDevBusy(false);
    }
  }

  async function handleAdvance(days: number) {
    setDevError('');
    setDevBusy(true);
    try {
      const res = await client.post('/dev/advance', { days });
      setSimulatedTime(res.data.simulatedTime);
      setTimeInput(toLocalInputValue(res.data.simulatedTime));
    } catch (err: any) {
      setDevError(err.response?.data?.error || 'Could not advance the simulated time');
    } finally {
      setDevBusy(false);
    }
  }

  async function handleReset() {
    setDevError('');
    setDevBusy(true);
    try {
      const res = await client.post('/dev/reset');
      setSimulatedTime(res.data.simulatedTime);
      setTimeInput(toLocalInputValue(res.data.simulatedTime));
    } catch (err: any) {
      setDevError(err.response?.data?.error || 'Could not reset the simulated time');
    } finally {
      setDevBusy(false);
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
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
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
          <label className="flex items-center gap-2 text-sm text-stone-900 dark:text-stone-100 font-medium">
            <input
              type="checkbox"
              checked={devModeEnabled}
              disabled={devToggleBusy}
              onChange={(e) => handleToggleDevMode(e.target.checked)}
            />
            Developer mode
          </label>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
            Move the server's clock forward so you can test pact cycles without waiting for days to pass.
          </p>

          {devModeEnabled && (
            <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Simulated time:{' '}
                <span className="text-stone-900 dark:text-stone-100 font-medium">
                  {simulatedTime ? new Date(simulatedTime).toLocaleString() : 'Loading...'}
                </span>
              </p>

              <form onSubmit={handleSetTime} className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-xs text-stone-600 dark:text-stone-400 block mb-1">Set date &amp; time</label>
                  <input
                    type="datetime-local"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={devBusy}
                  className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-3 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40"
                >
                  Set time
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAdvance(1)}
                  disabled={devBusy}
                  className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5 hover:bg-stone-300 dark:hover:bg-stone-600 transition disabled:opacity-40"
                >
                  +1 day
                </button>
                <button
                  onClick={() => handleAdvance(7)}
                  disabled={devBusy}
                  className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5 hover:bg-stone-300 dark:hover:bg-stone-600 transition disabled:opacity-40"
                >
                  +7 days
                </button>
                <button
                  onClick={handleReset}
                  disabled={devBusy}
                  className="text-sm text-stone-500 dark:text-stone-400 underline disabled:opacity-40"
                >
                  Reset to real time
                </button>
              </div>

              {devError && <p className="text-red-600 dark:text-red-400 text-sm">{devError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
