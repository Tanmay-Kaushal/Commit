import { useState } from 'react';
import client from '../api/client';
import type { FriendRequestEvent } from '../api/socket';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 dark:bg-black/60 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-lg border border-stone-200 dark:border-stone-800 p-6">
        <p className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-1">
          Friend request
        </p>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-4">
          {request.from.email} wants to be your friend
        </h2>

        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex-1 bg-emerald-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-emerald-700 transition disabled:opacity-40"
          >
            Accept
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex-1 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-300 dark:hover:bg-stone-600 transition disabled:opacity-40"
          >
            Reject
          </button>
        </div>
        <button
          onClick={onDone}
          disabled={busy}
          className="w-full text-xs text-stone-400 dark:text-stone-500 underline mt-3"
        >
          Decide later
        </button>
      </div>
    </div>
  );
}
