import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';

const COMMON_TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

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
    <div className="min-h-screen bg-stone-50">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-stone-900 mb-6">Your profile</h1>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 max-w-md"
        >
          <div>
            <label className="text-sm text-stone-600 block mb-1">Email</label>
            <input
              value={user?.email || ''}
              disabled
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-100 text-stone-400"
            />
            <p className="text-xs text-stone-400 mt-1">Email can't be changed.</p>
          </div>

          <div>
            <label className="text-sm text-stone-600 block mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-sm text-stone-600 block mb-1">Timezone</label>
            {COMMON_TIMEZONES.length > 0 ? (
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
              />
            )}
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {saved && <p className="text-emerald-600 text-sm">Profile updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
