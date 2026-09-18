import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePactUpdates } from '../api/socket';
import NavBar from '../components/NavBar';

type Participant = {
  id: number;
  pact_id: number;
  user_id: number | null;
  email: string;
  status: string;
  is_creator: number;
  username: string | null;
  user_email: string | null;
};

type Cycle = {
  id: number;
  cycle_start: string;
  cycle_end: string;
  status: string;
};

type CheckIn = { id: number; user_id: number; checked_in_at: string };

type Settlement = {
  id: number;
  cycle_id: number;
  user_id: number;
  completed: number;
  amount: number;
  settled: number;
  settled_by: number | null;
  username: string;
  email: string;
};

type Dispute = {
  id: number;
  cycle_id: number;
  user_id: number;
  status: string;
  username: string;
  email: string;
};

type PactDetail = {
  pact: {
    id: number;
    creator_id: number;
    habit_description: string;
    frequency_per_week: number;
    stake_amount: number;
    status: string;
    is_group: number;
  };
  participants: Participant[];
  cycle: Cycle | null;
  checkIns: CheckIn[];
  lastClosedCycle: Cycle | null;
  settlements: Settlement[];
  disputes: Dispute[];
};

function participantLabel(p: Participant) {
  return p.username || p.user_email || p.email;
}

export default function PactPage() {
  const { id } = useParams();
  const pactId = Number(id);
  const { user } = useAuth();
  const [data, setData] = useState<PactDetail | null>(null);
  const [error, setError] = useState('');

  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await client.get(`/pacts/${pactId}`);
      setData(res.data);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.response?.data?.error || 'Could not load this pact. Try refreshing the page.');
    }
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

  async function handleAccept() {
    await client.post(`/pacts/${pactId}/accept`);
    load();
  }

  async function handleReject() {
    await client.post(`/pacts/${pactId}/reject`);
    load();
  }

  async function handleDispute() {
    if (!data?.lastClosedCycle) return;
    await client.post(`/checkins/${pactId}/dispute`, { cycleId: data.lastClosedCycle.id });
    load();
  }

  async function handleResolveDispute(disputeUserId: number, approve: boolean) {
    if (!data?.lastClosedCycle) return;
    await client.post(`/checkins/${pactId}/dispute/resolve`, {
      cycleId: data.lastClosedCycle.id,
      userId: disputeUserId,
      approve,
    });
    load();
  }

  async function handleConfirmSettlement(settlementId: number) {
    await client.post(`/checkins/${pactId}/settlements/${settlementId}/confirm`);
    load();
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-8 text-sm">
          {loadError ? (
            <p className="text-red-600 dark:text-red-400">
              {loadError}{' '}
              <button onClick={load} className="underline">
                Retry
              </button>
            </p>
          ) : (
            <p className="text-stone-400 dark:text-stone-500">Loading...</p>
          )}
        </div>
      </div>
    );
  }

  const { pact, participants, cycle, checkIns, lastClosedCycle, settlements, disputes } = data;

  const activeParticipants = participants.filter((p) => p.status === 'active');
  const myParticipant = participants.find(
    (p) => p.user_id === user?.id || p.email === user?.email
  );
  const myCheckedIn = checkIns.some((c) => c.user_id === user?.id);
  const iAmPendingHere = myParticipant?.status === 'pending_invite';

  const mySettlement = settlements.find((s) => s.user_id === user?.id);
  const myDisputeAlreadyRaised = disputes.some((d) => d.user_id === user?.id);
  const disputesForOthers = disputes.filter((d) => d.user_id !== user?.id);
  const canIDispute =
    lastClosedCycle?.status === 'forfeited' &&
    mySettlement &&
    !mySettlement.completed &&
    !myDisputeAlreadyRaised;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/dashboard" className="text-sm text-stone-500 dark:text-stone-400 underline">
          &larr; Back to pacts
        </Link>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mt-4">
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            {pact.habit_description}
            {pact.is_group ? <span className="ml-2 text-xs text-stone-400 dark:text-stone-500 font-normal">(group)</span> : null}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {pact.frequency_per_week}x/week &middot; stake {pact.stake_amount} each
          </p>

          {iAmPendingHere ? (
            <div className="mt-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-amber-700 dark:text-amber-400 text-sm mb-3">You've been invited to this pact.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleAccept}
                  className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5"
                >
                  Accept
                </button>
                <button
                  onClick={handleReject}
                  className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : pact.status === 'pending_invite' ? (
            <p className="text-amber-600 dark:text-amber-400 text-sm mt-4">
              Waiting for everyone invited to accept before this pact starts.
            </p>
          ) : pact.status === 'declined' ? (
            <p className="text-red-500 dark:text-red-400 text-sm mt-4">This pact was declined and never started.</p>
          ) : (
            <>
              {cycle && (
                <div className="mt-6 grid grid-cols-2 gap-4">
                  {activeParticipants.map((p) => {
                    const checkedIn = checkIns.some((c) => c.user_id === p.user_id);
                    const isMe = p.user_id === user?.id;
                    return (
                      <div key={p.id} className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                        <p className="text-sm text-stone-500 dark:text-stone-400 mb-1">{isMe ? 'You' : participantLabel(p)}</p>
                        <p className={`font-medium ${checkedIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}`}>
                          {checkedIn ? 'Checked in' : 'Not yet'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {cycle?.status === 'active' && (
                <button
                  onClick={handleCheckIn}
                  disabled={myCheckedIn}
                  className="mt-6 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {myCheckedIn ? 'Already checked in' : 'Check in for this cycle'}
                </button>
              )}

              {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}

              {lastClosedCycle && (
                <div className="mt-8 border-t border-stone-200 dark:border-stone-800 pt-6">
                  <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-3">
                    Last cycle ({lastClosedCycle.status === 'completed' ? 'everyone completed' : 'settlement'})
                  </h2>

                  {lastClosedCycle.status === 'completed' ? (
                    <p className="text-emerald-600 dark:text-emerald-400 text-sm">
                      Everyone completed this cycle — no stakes changed hands.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {settlements.map((s) => {
                        const isMe = s.user_id === user?.id;
                        const label = isMe ? 'You' : s.username || s.email;
                        const isForfeit = s.amount < 0;
                        const isReceipt = s.amount > 0;
                        const canConfirm =
                          isForfeit &&
                          !s.settled &&
                          (isMe || settlements.some((r) => r.user_id === user?.id && r.amount > 0));

                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between border border-stone-200 dark:border-stone-700 rounded-lg px-4 py-3"
                          >
                            <div>
                              <p className="text-sm text-stone-900 dark:text-stone-100">{label}</p>
                              <p className="text-xs text-stone-400 dark:text-stone-500">
                                {s.completed ? 'Completed' : 'Forfeited'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {isForfeit && (
                                <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                                  Owes {Math.abs(s.amount).toFixed(2)}
                                </span>
                              )}
                              {isReceipt && (
                                <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                  Gets {s.amount.toFixed(2)}
                                </span>
                              )}
                              {s.amount === 0 && !s.completed && (
                                <span className="text-sm text-stone-400 dark:text-stone-500">No one to pay</span>
                              )}
                              {isForfeit && s.settled && (
                                <span className="text-xs text-stone-400 dark:text-stone-500">Paid &#10003;</span>
                              )}
                              {canConfirm && (
                                <button
                                  onClick={() => handleConfirmSettlement(s.id)}
                                  className="text-xs underline text-stone-500 dark:text-stone-400"
                                >
                                  Confirm paid
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canIDispute && (
                    <button onClick={handleDispute} className="text-sm text-red-700 dark:text-red-400 underline mt-4">
                      I did it but forgot to log it
                    </button>
                  )}
                  {myDisputeAlreadyRaised && (
                    <p className="text-amber-600 dark:text-amber-400 text-sm mt-4">
                      Your dispute is waiting on another participant to resolve it.
                    </p>
                  )}

                  {disputesForOthers.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {disputesForOthers.map((d) => (
                        <div key={d.id} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                          <p className="text-amber-700 dark:text-amber-400 text-sm mb-2">
                            {d.username || d.email} disputes being marked as forfeited.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolveDispute(d.user_id, true)}
                              className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolveDispute(d.user_id, false)}
                              className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <Link
            to={`/pacts/${pactId}/timeline`}
            className="block mt-6 text-sm text-stone-500 dark:text-stone-400 underline"
          >
            View full history
          </Link>
        </div>
      </div>
    </div>
  );
}
