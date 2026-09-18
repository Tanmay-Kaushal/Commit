import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

// Best-effort guess at the user's timezone from the browser; they can't
// change it later in this version, which is fine for a first pass.
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState('');
  const { signup } = useAuth();
  const navigate = useNavigate();

  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Once the user has typed a plausible email and hasn't hand-edited the
  // username themselves yet, auto-suggest one based on the email.
  useEffect(() => {
    if (usernameTouched) return;
    if (!email.includes('@')) return;

    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    suggestDebounce.current = setTimeout(async () => {
      try {
        const res = await client.get('/auth/suggest-username', { params: { email } });
        setUsername(res.data.username);
        setUsernameStatus('available');
      } catch {
        // best-effort suggestion — if it fails, the user can still type their own
      }
    }, 400);

    return () => {
      if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    };
  }, [email, usernameTouched]);

  // Check availability whenever the username value changes (whether from
  // auto-suggestion or the user typing their own).
  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    if (checkDebounce.current) clearTimeout(checkDebounce.current);
    checkDebounce.current = setTimeout(async () => {
      try {
        const res = await client.get('/auth/username-available', { params: { username } });
        if (res.data.reason === 'invalid') {
          setUsernameStatus('invalid');
        } else {
          setUsernameStatus(res.data.available ? 'available' : 'taken');
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => {
      if (checkDebounce.current) clearTimeout(checkDebounce.current);
    };
  }, [username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (usernameStatus === 'taken' || usernameStatus === 'invalid') {
      setError('Please choose a different username');
      return;
    }

    try {
      await signup(email, password, detectedTimezone, username || undefined);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
    }
  }

  function usernameHint() {
    if (usernameStatus === 'checking') return <span className="text-stone-400 dark:text-stone-500">Checking...</span>;
    if (usernameStatus === 'available') return <span className="text-emerald-600 dark:text-emerald-400">Available</span>;
    if (usernameStatus === 'taken') return <span className="text-red-600 dark:text-red-400">Already taken</span>;
    if (usernameStatus === 'invalid') {
      return <span className="text-red-600 dark:text-red-400">3-20 characters: letters, numbers, underscores</span>;
    }
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1">Commit</h1>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-6">Create your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            required
            minLength={6}
          />
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => {
                setUsernameTouched(true);
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
              }}
              className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            />
            <p className="text-xs mt-1">
              {usernameHint() || (
                <span className="text-stone-400 dark:text-stone-500">
                  We'll suggest one from your email — feel free to change it
                </span>
              )}
            </p>
          </div>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Timezone detected as {detectedTimezone}
          </p>
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg py-2 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition"
          >
            Sign up
          </button>
        </form>

        <p className="text-sm text-stone-500 dark:text-stone-400 mt-4 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-stone-900 dark:text-stone-100 font-medium underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
