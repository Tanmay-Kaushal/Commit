import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePactUpdates } from '../api/socket';
import NavBar from '../components/NavBar';

type PactDetail = {
  pact: {
    id: number;
    creator_id: number;
    partner_id: number | null;
    partner_email: string;
    habit_description: string;
    frequency_per_week: number;
    stake_amount: number;
    status: string;
  };
  cycle: {
    id: number;
    cycle_start: string;
    cycle_end: string;
    status: string;
  } | null;
  checkIns: { id: number; user_id: number; checked_in_at: string }[];
};

export default function PactPage() {
  const { id } = useParams();
  const pactId = Number(id);
  const { user } = useAuth();
  const [data, setData] = useState<PactDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await client.get(`/pacts/${pactId}`);
    setData(res.data);
  }, [pactId]);

  useEffect(() => {
    load();
  }, [load]);

  usePactUpdates(pactId, load);

  async function handleCheckIn() {
    setError('');
    try {
      await client.post(`/checkins/${pactId}/checkin`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not check in');
    }
  }

  async function handleDispute() {
    if (!data?.cycle) return;
    await client.post(`/checkins/${pactId}/dispute`, { cycleId: data.cycle.id });
    load();
  }

  async function handleResolveDispute(approve: boolean) {
    if (!data?.cycle) return;
    await client.post(`/checkins/${pactId}/dispute/resolve`, {
      cycleId: data.cycle.id,
      approve,
    });
    load();
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-50">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-8 text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  const { pact, cycle, checkIns } = data;
  const isCreator = pact.creator_id === user?.id;
  const myCheckedIn = checkIns.some((c) => c.user_id === user?.id);
  const partnerId = isCreator ? pact.partner_id : pact.creator_id;
  const partnerCheckedIn = checkIns.some((c) => c.user_id === partnerId);

  return (
    <div className="min-h-screen bg-stone-50">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/dashboard" className="text-sm text-stone-500 underline">
          &larr; Back to pacts
        </Link>

        <div className="bg-white border border-stone-200 rounded-xl p-6 mt-4">
          <h1 className="text-xl font-semibold text-stone-900">{pact.habit_description}</h1>
          <p className="text-sm text-stone-500 mt-1">
            {pact.frequency_per_week}x/week &middot; stake {pact.stake_amount}
          </p>

          {pact.status !== 'active' ? (
            <p className="text-amber-600 text-sm mt-4">
              Waiting for {pact.partner_email} to accept the invite.
            </p>
          ) : (
            <>
              {cycle && (
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="border border-stone-200 rounded-lg p-4">
                    <p className="text-sm text-stone-500 mb-1">You</p>
                    <p className={`font-medium ${myCheckedIn ? 'text-emerald-600' : 'text-stone-400'}`}>
                      {myCheckedIn ? 'Checked in' : 'Not yet'}
                    </p>
                  </div>
                  <div className="border border-stone-200 rounded-lg p-4">
                    <p className="text-sm text-stone-500 mb-1">Partner</p>
                    <p className={`font-medium ${partnerCheckedIn ? 'text-emerald-600' : 'text-stone-400'}`}>
                      {partnerCheckedIn ? 'Checked in' : 'Not yet'}
                    </p>
                  </div>
                </div>
              )}

              {cycle?.status === 'active' && (
                <button
                  onClick={handleCheckIn}
                  disabled={myCheckedIn}
                  className="mt-6 bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {myCheckedIn ? 'Already checked in' : 'Check in for this cycle'}
                </button>
              )}

              {cycle?.status === 'forfeited' && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 text-sm mb-2">This cycle was forfeited.</p>
                  <button
                    onClick={handleDispute}
                    className="text-sm text-red-700 underline"
                  >
                    I did it but forgot to log it
                  </button>
                </div>
              )}

              {cycle?.status === 'disputed' && (
                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-amber-700 text-sm mb-2">
                    A dispute has been raised on this cycle.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolveDispute(true)}
                      className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleResolveDispute(false)}
                      className="text-sm bg-stone-200 text-stone-700 rounded-lg px-3 py-1.5"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {cycle?.status === 'completed' && (
                <p className="mt-6 text-emerald-600 text-sm font-medium">
                  This cycle was completed by both of you.
                </p>
              )}

              {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
            </>
          )}

          <Link
            to={`/pacts/${pactId}/timeline`}
            className="block mt-6 text-sm text-stone-500 underline"
          >
            View full history
          </Link>
        </div>
      </div>
    </div>
  );
}
