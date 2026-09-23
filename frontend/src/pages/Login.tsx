import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { takePendingInvite, pendingInvitePath } from '../pendingInvite';
import Card from '../components/ui/Card';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function Doodle({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 opacity-70 ${className || ''}`}>
      {label && (
        <span className="text-[10px] bg-[var(--paper)] border-2 border-[var(--ink)] rounded-full px-2 py-0.5 text-[var(--ink)] whitespace-nowrap">
          {label}
        </span>
      )}
      <svg width="20" height="30" viewBox="0 0 20 30" fill="none">
        <circle cx="10" cy="6" r="5" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="10" y1="11" x2="10" y2="22" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="10" y1="14" x2="3" y2="19" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="10" y1="14" x2="17" y2="19" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="10" y1="22" x2="4" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="10" y1="22" x2="16" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

const STEPS = [
  { n: 1, text: 'Commit to a habit with a friend and a stake.' },
  { n: 2, text: 'Check in on the days you agreed to.' },
  { n: 3, text: "Miss one, and your stake splits among who didn't." },
];

export default function Login() {
  const [error, setError] = useState('');
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSuccess(credential: string | undefined) {
    if (!credential) {
      setError('Google sign-in did not return a credential');
      return;
    }
    setError('');
    try {
      await loginWithGoogle(credential);
      const pending = takePendingInvite();
      navigate(pending ? pendingInvitePath(pending) : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sign-in failed');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-x-0 top-10 hidden sm:flex justify-between px-10 md:px-24 pointer-events-none">
        <Doodle label="day 12" className="mt-6" />
        <Doodle label="did you go?" />
        <Doodle className="mt-10" />
        <Doodle label="pay up" className="mt-2" />
      </div>

      <div className="relative z-10 text-center mb-8">
        <h1 className="font-display text-5xl sm:text-6xl text-[var(--ink)] mb-3">Commit</h1>
        <p className="text-[var(--graphite)] text-sm sm:text-base max-w-sm mx-auto">
          You said you'd do it. Your friends are watching. There's money on it.
        </p>
      </div>

      <Card className="relative z-10 w-full max-w-sm p-8 text-center">
        <p className="text-[var(--graphite)] text-sm mb-6">Sign in to your account</p>

        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center">
            <GoogleLogin onSuccess={(res) => handleSuccess(res.credential)} onError={() => setError('Google sign-in failed')} />
          </div>
        ) : (
          <p className="text-red-600 dark:text-red-400 text-sm">
            Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).
          </p>
        )}

        {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}
      </Card>

      <div className="relative z-10 mt-8 flex flex-col sm:flex-row gap-3 max-w-2xl">
        {STEPS.map((s) => (
          <div key={s.n} className="flex items-start gap-2 text-left max-w-[220px]">
            <span className="shrink-0 w-6 h-6 rounded-full border-2 border-[var(--ink)] bg-[var(--accent)] text-[var(--ink)] text-xs font-display flex items-center justify-center">
              {s.n}
            </span>
            <p className="text-xs text-[var(--graphite)]">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
