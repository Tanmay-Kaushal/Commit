import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { PactInviteEvent } from '../api/socket';

// A small centered modal that pops up live (over sockets, no reload) when
// someone invites the current user to a pact. Accept/reject right here,
// or dismiss to decide later from the dashboard.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-stone-200 p-6">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-1">
          {invite.isGroup ? 'Group pact invite' : 'Pact invite'}
        </p>
        <h2 className="text-lg font-semibold text-stone-900 mb-3">
          {invite.from.email} invited you to a pact
        </h2>

        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-1 mb-4">
          <p className="text-sm text-stone-900 font-medium">{invite.habitDescription}</p>
          <p className="text-sm text-stone-500">
            {invite.frequencyPerWeek}x/week &middot; stake {invite.stakeAmount} &middot; every{' '}
            {invite.cycleLengthDays} day{invite.cycleLengthDays === 1 ? '' : 's'}
          </p>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

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
            className="flex-1 bg-stone-200 text-stone-700 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-300 transition disabled:opacity-40"
          >
            Reject
          </button>
        </div>
        <button
          onClick={onDone}
          disabled={busy}
          className="w-full text-xs text-stone-400 underline mt-3"
        >
          Decide later
        </button>
      </div>
    </div>
  );
}
