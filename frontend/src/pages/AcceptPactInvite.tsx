import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { savePendingInvite } from '../pendingInvite';
import PactInvitePopup from '../components/PactInvitePopup';
import type { PactInviteEvent } from '../api/socket';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

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
      <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
        <Card className="w-full max-w-sm p-8 text-center">
          <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
          <Button size="sm" onClick={() => navigate('/dashboard')}>
            Go to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (!invite) {
    return <div className="min-h-screen bg-[var(--paper)]" />;
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <PactInvitePopup invite={invite} onDone={() => navigate('/dashboard')} />
    </div>
  );
}
