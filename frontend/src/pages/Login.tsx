import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { takePendingInvite, pendingInvitePath } from '../pendingInvite';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1">Commit</h1>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-6">Sign in to your account</p>

        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(res) => handleSuccess(res.credential)}
              onError={() => setError('Google sign-in failed')}
            />
          </div>
        ) : (
          <p className="text-red-600 dark:text-red-400 text-sm">
            Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).
          </p>
        )}

        {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
}
