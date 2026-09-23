import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { PactInviteEvent } from '../api/socket';
import { describeMask } from '../weekdays';
import Card from './ui/Card';
import Button from './ui/Button';

export default function PactInvitePopup({
  invite,
  onDone,
}: {
  invite: PactInviteEvent;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleAccept() {
    setBusy(true);
    setError('');
    try {
      await client.post(`/pacts/${invite.pactId}/accept`);
      onDone();
      navigate(`/pacts/${invite.pactId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not accept invite');
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError('');
    try {
      await client.post(`/pacts/${invite.pactId}/reject`);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not decline invite');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <p className="text-xs font-semibold text-[var(--graphite)] uppercase tracking-wide mb-1">
          {invite.isGroup ? 'Group pact invite' : 'Pact invite'}
        </p>
        <h2 className="font-display text-lg text-[var(--ink)] mb-3">{invite.from.email} invited you to a pact</h2>

        <div className="bg-[var(--line)]/40 border-2 border-[var(--line)] rounded-xl p-4 space-y-1 mb-4">
          <p className="text-sm text-[var(--ink)] font-medium">{invite.habitDescription}</p>
          <p className="text-sm text-[var(--graphite)]">
            {describeMask(invite.scheduledDays)} &middot; stake {invite.stakeAmount} per missed day
          </p>
          <p className="text-sm text-[var(--graphite)]">
            {invite.startDate} &rarr; {invite.endDate}
          </p>
        </div>

        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleAccept} disabled={busy}>
            Accept
          </Button>
          <Button className="flex-1" variant="secondary" onClick={handleReject} disabled={busy}>
            Reject
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-3" onClick={onDone} disabled={busy}>
          Decide later
        </Button>
      </Card>
    </div>
  );
}
