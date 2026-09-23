import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type NotifyPrefs } from '../context/AuthContext';
import { useTheme, type ThemeSetting } from '../context/ThemeContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import NavBar from '../components/NavBar';
import { useToast } from '../components/ui/Toast';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const CURRENCY_OPTIONS = ['$', '€', '£', '₹', '¥'];

const NOTIFY_TYPES: { key: keyof NotifyPrefs; label: string }[] = [
  { key: 'pact_invite', label: 'Pact invites' },
  { key: 'friend_request', label: 'Friend requests' },
  { key: 'pact_day_completed', label: 'Everyone checked in' },
  { key: 'debt_reminder', label: 'Debt reminders' },
  { key: 'payment_received', label: 'Payments received' },
];

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border-2 border-[var(--ink)] overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
            value === opt.value ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--line)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm text-[var(--ink)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full border-2 border-[var(--ink)] relative transition-colors shrink-0 ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--paper)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--ink)] transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const { user, updateSettings, deleteAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const { show } = useToast();
  const navigate = useNavigate();

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!user) return null;
  // Defensive defaults — a real login always includes these (see
  // userSerializer.js), but this guards against a stale cached user object
  // predating a field's introduction rather than blank-crashing the page.
  const notifyPrefs = user.notifyPrefs || {};
  const currency = user.currency || '$';
  const weekStart = user.weekStart || 'mon';
  const discoverable = user.discoverable ?? true;

  async function handleThemeChange(next: ThemeSetting) {
    setTheme(next);
    try {
      await updateSettings({ theme: next });
    } catch {
      show('Could not save theme preference', 'error');
    }
  }

  async function handleCurrencyChange(currency: string) {
    try {
      await updateSettings({ currency });
      show('Currency updated', 'success');
    } catch {
      show('Could not save currency', 'error');
    }
  }

  async function handleWeekStartChange(weekStart: 'mon' | 'sun') {
    try {
      await updateSettings({ weekStart });
      show('Week start updated', 'success');
    } catch {
      show('Could not save week start', 'error');
    }
  }

  async function handleDiscoverableChange(discoverable: boolean) {
    try {
      await updateSettings({ discoverable });
    } catch {
      show('Could not save privacy setting', 'error');
    }
  }

  async function handleNotifyPrefChange(key: keyof NotifyPrefs, value: boolean) {
    try {
      await updateSettings({ notifyPrefs: { ...(user!.notifyPrefs || {}), [key]: value } });
    } catch {
      show('Could not save notification setting', 'error');
    }
  }

  async function handleDelete() {
    setDeleteError('');
    if (deleteConfirmText.trim().toLowerCase() !== (user!.username || '').toLowerCase()) {
      setDeleteError('Type your username exactly to confirm');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount();
      navigate('/login');
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || 'Could not delete your account');
    } finally {
      setDeleting(false);
    }
  }

  const masterOn = notifyPrefs.master !== false;

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="font-display text-2xl text-[var(--ink)]">Settings</h1>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold text-sm text-[var(--ink)]">Appearance</h2>
          <SegmentedControl value={theme} options={THEME_OPTIONS} onChange={handleThemeChange} />
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-sm text-[var(--ink)]">Preferences</h2>
          <div>
            <p className="text-xs text-[var(--graphite)] mb-2">Currency symbol (display only — no conversion)</p>
            <div className="flex flex-wrap gap-2">
              {CURRENCY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCurrencyChange(c)}
                  className={`w-9 h-9 rounded-full border-2 border-[var(--ink)] text-sm font-semibold transition-colors ${
                    currency === c ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--line)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--graphite)] mb-2">Week starts on</p>
            <SegmentedControl
              value={weekStart}
              options={[
                { value: 'mon' as const, label: 'Monday' },
                { value: 'sun' as const, label: 'Sunday' },
              ]}
              onChange={handleWeekStartChange}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <h2 className="font-semibold text-sm text-[var(--ink)] mb-1">Notifications</h2>
          <Toggle
            label="All push notifications"
            checked={masterOn}
            onChange={(v) => handleNotifyPrefChange('master', v)}
          />
          <div className="border-t-2 border-[var(--line)] my-2" />
          {NOTIFY_TYPES.map((t) => (
            <Toggle
              key={t.key}
              label={t.label}
              checked={notifyPrefs[t.key] !== false}
              onChange={(v) => handleNotifyPrefChange(t.key, v)}
            />
          ))}
        </Card>

        <Card className="p-5 space-y-2">
          <h2 className="font-semibold text-sm text-[var(--ink)] mb-1">Privacy</h2>
          <Toggle
            label="Let people find me by username"
            checked={discoverable}
            onChange={handleDiscoverableChange}
          />
          <p className="text-xs text-[var(--graphite)]">
            Your email address and invite links always work, even if this is off.
          </p>

          <div className="border-t-2 border-[var(--line)] my-2" />

          {!showDeleteConfirm ? (
            <Button variant="ghost" size="sm" className="!text-red-600 dark:!text-red-400" onClick={() => setShowDeleteConfirm(true)}>
              Delete my account
            </Button>
          ) : (
            <div className="space-y-3 pt-1">
              <h3 className="font-semibold text-sm text-red-600 dark:text-red-400">This can't be undone</h3>
              <p className="text-sm text-[var(--graphite)]">
                Blocked while you're in an active pact or have an unpaid stake — settle up first. Pacts you created
                pass to another member, or are deleted if you're the only one left.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={`Type "${user.username}" to confirm`}
                className="w-full border-2 border-[var(--ink)] rounded-full px-4 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
              />
              {deleteError && <p className="text-red-600 dark:text-red-400 text-sm">{deleteError}</p>}
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete my account'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                    setDeleteError('');
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
