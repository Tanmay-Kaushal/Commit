import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { savePendingInvite } from '../pendingInvite';
import PactInvitePopup from '../components/PactInvitePopup';
import type { PactInviteEvent } from '../api/socket';

export default function AcceptPactInvite() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<PactInviteEvent | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;

    if (!user) {
      savePendingInvite('pact', code);
      navigate('/login');
      return;
    }

    client
      .post(`/invites/pact/${code}/claim`)
      .then((res) => {
        const data = res.data;
        if (data.alreadyParticipant && data.participantStatus !== 'pending_invite') {
          navigate(`/pacts/${data.pactId}`);
          return;
        }
        setInvite(data);
      })
      .catch((err) => setError(err.response?.data?.error || 'This invite link is no longer valid'));
  }, [code, user, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
          <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-stone-900 dark:text-stone-100 font-medium underline">
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!invite) {
    return <div className="min-h-screen bg-stone-50 dark:bg-stone-950" />;
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <PactInvitePopup invite={invite} onDone={() => navigate('/dashboard')} />
    </div>
  );
}
