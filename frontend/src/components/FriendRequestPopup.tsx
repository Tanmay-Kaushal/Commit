import { useState } from 'react';
import client from '../api/client';
import type { FriendRequestEvent } from '../api/socket';
import Card from './ui/Card';
import Button from './ui/Button';

// Same modal pattern as PactInvitePopup — pops up live (over sockets, no
// reload) when someone sends the current user a friend request.
export default function FriendRequestPopup({
  request,
  onDone,
}: {
  request: FriendRequestEvent;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setBusy(true);
    setError('');
    try {
      await client.post(`/friends/requests/${request.id}/accept`);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not accept request');
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError('');
    try {
      await client.post(`/friends/requests/${request.id}/reject`);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not decline request');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <p className="text-xs font-semibold text-[var(--graphite)] uppercase tracking-wide mb-1">Friend request</p>
        <h2 className="font-display text-lg text-[var(--ink)] mb-4">{request.from.email} wants to be your friend</h2>

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
