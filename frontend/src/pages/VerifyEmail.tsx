import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { takePendingInvite, pendingInvitePath } from '../pendingInvite';

const PENDING_EMAIL_KEY = 'pendingVerificationEmail';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyEmail, resendCode } = useAuth();

  const [email] = useState(() => {
    const fromState = (location.state as { email?: string } | null)?.email;
    if (fromState) {
      sessionStorage.setItem(PENDING_EMAIL_KEY, fromState);
      return fromState;
    }
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || '';
  });

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown(seconds: number) {
    setResendCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyEmail(email, code);
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      const pending = takePendingInvite();
      navigate(pending ? pendingInvitePath(pending) : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not verify — try again');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setResendMessage('');
    setBusy(true);
    try {
      await resendCode(email);
      setResendMessage('New code sent.');
      startCooldown(60);
    } catch (err: any) {
      const retryAfter = err.response?.data?.retryAfter;
      if (retryAfter) startCooldown(retryAfter);
      setError(err.response?.data?.error || 'Could not resend the code');
    } finally {
      setBusy(false);
    }
  }

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
          <p className="text-stone-600 dark:text-stone-400 text-sm mb-4">
            No signup in progress. Start over from the signup page.
          </p>
          <Link to="/signup" className="text-stone-900 dark:text-stone-100 font-medium underline text-sm">
            Go to signup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1">Verify your email</h1>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-6">
          We sent a 6-digit code to <span className="text-stone-700 dark:text-stone-300 font-medium">{email}</span>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            maxLength={6}
            autoFocus
            required
          />
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          {resendMessage && !error && <p className="text-emerald-600 dark:text-emerald-400 text-sm">{resendMessage}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg py-2 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40"
          >
            Verify
          </button>
        </form>

        <button
          onClick={handleResend}
          disabled={busy || resendCooldown > 0}
          className="w-full text-sm text-stone-500 dark:text-stone-400 underline mt-4 text-center disabled:opacity-40 disabled:no-underline"
        >
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
        </button>

        <p className="text-sm text-stone-500 dark:text-stone-400 mt-4 text-center">
          Wrong email?{' '}
          <Link
            to="/signup"
            onClick={() => sessionStorage.removeItem(PENDING_EMAIL_KEY)}
            className="text-stone-900 dark:text-stone-100 font-medium underline"
          >
            Start over
          </Link>
        </p>
      </div>
    </div>
  );
}
