import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { savePendingInvite } from '../pendingInvite';

type Preview = { userId: number; username: string; email: string };

export default function AcceptFriendInvite() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!code) return;

    if (!user) {
      savePendingInvite('friend', code);
      navigate('/login');
      return;
    }

    client
      .get(`/invites/friend/${code}`)
      .then((res) => setPreview(res.data))
      .catch((err) => setError(err.response?.data?.error || 'This invite link is no longer valid'));
  }, [code, user, navigate]);

  useEffect(() => {
    if (!code || !user || !preview) return;
    client
      .post(`/invites/friend/${code}/claim`)
      .then(() => {
        setClaimed(true);
        setTimeout(() => navigate('/dashboard'), 1500);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not accept this invite'));
  }, [code, user, preview, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
        {error ? (
          <>
            <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
            <button onClick={() => navigate('/dashboard')} className="text-sm text-stone-900 dark:text-stone-100 font-medium underline">
              Go to dashboard
            </button>
          </>
        ) : claimed ? (
          <p className="text-emerald-600 dark:text-emerald-400 text-sm">
            You're now friends with {preview?.username || preview?.email}. Taking you to your dashboard...
          </p>
        ) : preview ? (
          <p className="text-stone-600 dark:text-stone-400 text-sm">Connecting you with {preview.username || preview.email}...</p>
        ) : (
          <p className="text-stone-400 dark:text-stone-500 text-sm">Loading...</p>
        )}
      </div>
    </div>
  );
}
