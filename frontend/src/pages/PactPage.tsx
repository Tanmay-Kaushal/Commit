import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePactUpdates } from '../api/socket';
import NavBar from '../components/NavBar';
import InviteLinkButton from '../components/InviteLinkButton';
import { describeMask } from '../weekdays';

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

type CheckIn = { id: number; user_id: number; checked_in_at: string };

type Settlement = {
  id: number;
  pact_day_id: number;
  user_id: number;
  completed: number;
  amount_cents: number;
  settled: number;
  settled_by: number | null;
  username: string;
  email: string;
};

type Dispute = {
  id: number;
  pact_day_id: number;
  user_id: number;
  status: string;
  username: string;
  email: string;
};

type HistoryDay = {
  id: number;
  pact_id: number;
  scheduled_date: string;
  status: string;
  settlements: Settlement[];
  disputes: Dispute[];
};

type PactDetail = {
  pact: {
    id: number;
    creator_id: number;
    habit_description: string;
    stake_amount: number;
    scheduled_days: number;
    start_date: string;
    end_date: string;
    status: string;
    is_group: number;
  };
  participants: Participant[];
  today: string | null;
  todayPactDay: { id: number; scheduled_date: string; status: string } | null;
  todayCheckIns: CheckIn[];
  history: HistoryDay[];
};

function participantLabel(p: Participant) {
  return p.username || p.user_email || p.email;
}

const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  pending_invite: 'invited',
  active: 'active',
  declined: 'declined',
  dropped_noresponse: "didn't respond in time",
  left: 'left',
  removed_by_creator: 'removed',
};

export default function PactPage() {
  const { id } = useParams();
  const pactId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PactDetail | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [addIdentifier, setAddIdentifier] = useState('');
  const [addError, setAddError] = useState('');

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

  async function handleUncheckIn() {
    setError('');
    try {
      await client.delete(`/checkins/${pactId}/checkin`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not undo check-in');
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

  async function handleLeave() {
    if (!confirm("Leave this pact? You can't rejoin later.")) return;
    await client.post(`/pacts/${pactId}/leave`);
    navigate('/dashboard');
  }

  async function handleDispute(pactDayId: number) {
    await client.post(`/checkins/${pactId}/dispute`, { pactDayId });
    load();
  }

  async function handleResolveDispute(pactDayId: number, disputeUserId: number, approve: boolean) {
    await client.post(`/checkins/${pactId}/dispute/resolve`, { pactDayId, userId: disputeUserId, approve });
    load();
  }

  async function handleConfirmSettlement(settlementId: number) {
    await client.post(`/checkins/${pactId}/settlements/${settlementId}/confirm`);
    load();
  }

  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    const identifiers = addIdentifier.split(',').map((s) => s.trim()).filter(Boolean);
    if (identifiers.length === 0) {
      setAddError('Enter at least one email or username');
      return;
    }
    try {
      await client.post(`/pacts/${pactId}/participants`, { identifiers });
      setAddIdentifier('');
      setShowAddParticipant(false);
      load();
    } catch (err: any) {
      setAddError(err.response?.data?.error || 'Could not add participant');
    }
  }

  async function handleRemoveParticipant(participantId: number, label: string) {
    if (!confirm(`Remove ${label} from this pact?`)) return;
    setError('');
    try {
      await client.delete(`/pacts/${pactId}/participants/${participantId}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not remove participant');
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-8 text-sm">
          {loadError ? (
            <p className="text-red-600 dark:text-red-400">
              {loadError} <button onClick={load} className="underline">Retry</button>
            </p>
          ) : (
            <p className="text-stone-400 dark:text-stone-500">Loading...</p>
          )}
        </div>
      </div>
    );
  }

  const { pact, participants, todayPactDay, todayCheckIns, history } = data;

  const activeParticipants = participants.filter((p) => p.status === 'active');
  const myParticipant = participants.find((p) => p.user_id === user?.id || p.email === user?.email);
  const iAmCreator = !!myParticipant?.is_creator;
  const iAmPendingHere = myParticipant?.status === 'pending_invite';
  const iAmActive = myParticipant?.status === 'active';
  const myCheckedInToday = todayCheckIns.some((c) => c.user_id === user?.id);

  const removableParticipants = participants.filter((p) => !p.is_creator && ['pending_invite', 'active'].includes(p.status));
  const canManageParticipants = ['pending_invite', 'active'].includes(pact.status);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/dashboard" className="text-sm text-stone-500 dark:text-stone-400 underline">&larr; Back to pacts</Link>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
                {pact.habit_description}
                {pact.is_group ? <span className="ml-2 text-xs text-stone-400 dark:text-stone-500 font-normal">(group)</span> : null}
              </h1>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                {describeMask(pact.scheduled_days)} &middot; stake {pact.stake_amount} per missed day
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500">{pact.start_date} &rarr; {pact.end_date}</p>
            </div>
            {iAmCreator && <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full px-2 py-1 shrink-0">Creator</span>}
          </div>

          {iAmPendingHere ? (
            <div className="mt-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-amber-700 dark:text-amber-400 text-sm mb-3">You've been invited to this pact.</p>
              <div className="flex gap-2">
                <button onClick={handleAccept} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5">Accept</button>
                <button onClick={handleReject} className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5">Reject</button>
              </div>
            </div>
          ) : pact.status === 'pending_invite' ? (
            <p className="text-amber-600 dark:text-amber-400 text-sm mt-4">
              {pact.start_date > new Date().toISOString().slice(0, 10)
                ? `Waiting for a partner to accept. This activates once ${pact.start_date} arrives, if someone's said yes by then.`
                : "Waiting for a partner to accept — it'll activate the moment one does."}
            </p>
          ) : pact.status === 'cancelled' ? (
            <p className="text-red-500 dark:text-red-400 text-sm mt-4">This pact was cancelled by its creator.</p>
          ) : pact.status === 'completed' ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm mt-4">
              This pact ran its full course ({pact.start_date} to {pact.end_date}).
            </p>
          ) : pact.status === 'closed' ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm mt-4">This pact was closed early by its creator.</p>
          ) : (
            <>
              {todayPactDay && (
                <div className="mt-6 grid grid-cols-2 gap-4">
                  {activeParticipants.map((p) => {
                    const checkedIn = todayCheckIns.some((c) => c.user_id === p.user_id);
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

              {!todayPactDay && (
                <p className="text-sm text-stone-400 dark:text-stone-500 mt-6">Today isn't a scheduled day for this pact.</p>
              )}

              {todayPactDay?.status === 'pending' && iAmActive && (
                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={handleCheckIn}
                    disabled={myCheckedInToday}
                    className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {myCheckedInToday ? 'Already checked in today' : 'Check in for today'}
                  </button>
                  {myCheckedInToday && (
                    <button onClick={handleUncheckIn} className="text-sm text-stone-500 dark:text-stone-400 underline">
                      Undo (checked in by mistake)
                    </button>
                  )}
                </div>
              )}

              {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}

              {iAmActive && !iAmCreator && (
                <button onClick={handleLeave} className="block mt-6 text-xs text-red-500 dark:text-red-400 underline">
                  Leave this pact
                </button>
              )}

              {history.length > 0 && (
                <div className="mt-8 border-t border-stone-200 dark:border-stone-800 pt-6">
                  <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-3">History (most recent first)</h2>
                  <div className="space-y-4">
                    {history.map((day) => {
                      const disputesForOthers = day.disputes.filter((d) => d.user_id !== user?.id);
                      const myDisputeAlreadyRaised = day.disputes.some((d) => d.user_id === user?.id);
                      const mySettlement = day.settlements.find((s) => s.user_id === user?.id);
                      const canIDispute = mySettlement && !mySettlement.completed && !myDisputeAlreadyRaised;
                      const everyoneCompleted = day.settlements.every((s) => s.completed);

                      return (
                        <div key={day.id} className="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
                          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 mb-2">{day.scheduled_date}</p>

                          {everyoneCompleted ? (
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm">Everyone checked in — no stakes changed hands.</p>
                          ) : (
                            <div className="space-y-2">
                              {day.settlements.map((s) => {
                                const isMe = s.user_id === user?.id;
                                const label = isMe ? 'You' : s.username || s.email;
                                const isForfeit = s.amount_cents < 0;
                                const isReceipt = s.amount_cents > 0;
                                const amount = Math.abs(s.amount_cents) / 100;
                                const canConfirm = isForfeit && !s.settled && (isMe || day.settlements.some((r) => r.user_id === user?.id && r.amount_cents > 0));

                                return (
                                  <div key={s.id} className="flex items-center justify-between text-sm">
                                    <div>
                                      <span className="text-stone-900 dark:text-stone-100">{label}</span>{' '}
                                      <span className="text-xs text-stone-400 dark:text-stone-500">{s.completed ? 'completed' : 'missed'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {isForfeit && <span className="text-red-600 dark:text-red-400 font-medium">Owes {amount.toFixed(2)}</span>}
                                      {isReceipt && <span className="text-emerald-600 dark:text-emerald-400 font-medium">Gets {amount.toFixed(2)}</span>}
                                      {s.amount_cents === 0 && !s.completed && <span className="text-stone-400 dark:text-stone-500">No one to pay</span>}
                                      {isForfeit && s.settled === 1 && <span className="text-xs text-stone-400 dark:text-stone-500">Paid &#10003;</span>}
                                      {canConfirm && (
                                        <button onClick={() => handleConfirmSettlement(s.id)} className="text-xs underline text-stone-500 dark:text-stone-400">
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
                            <button onClick={() => handleDispute(day.id)} className="text-xs text-red-700 dark:text-red-400 underline mt-3">
                              I did it but forgot to log it
                            </button>
                          )}
                          {myDisputeAlreadyRaised && (
                            <p className="text-amber-600 dark:text-amber-400 text-xs mt-3">Your dispute is waiting on another participant to resolve it.</p>
                          )}
                          {disputesForOthers.map((d) => (
                            <div key={d.id} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-3">
                              <p className="text-amber-700 dark:text-amber-400 text-xs mb-2">
                                {d.username || d.email} disputes being marked as missed.
                              </p>
                              <div className="flex gap-2">
                                <button onClick={() => handleResolveDispute(day.id, d.user_id, true)} className="text-xs bg-emerald-600 text-white rounded-lg px-2.5 py-1">Approve</button>
                                <button onClick={() => handleResolveDispute(day.id, d.user_id, false)} className="text-xs bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-2.5 py-1">Reject</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <Link to={`/pacts/${pactId}/timeline`} className="block mt-6 text-sm text-stone-500 dark:text-stone-400 underline">
            View full event log
          </Link>
        </div>

        {iAmCreator && (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mt-4">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3">Participants</h2>
            <div className="space-y-1.5">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-900 dark:text-stone-100">
                    {p.is_creator ? `${participantLabel(p)} (you, creator)` : participantLabel(p)}
                    <span className="text-xs text-stone-400 dark:text-stone-500 ml-2">{PARTICIPANT_STATUS_LABELS[p.status] || p.status}</span>
                  </span>
                  {removableParticipants.some((r) => r.id === p.id) && (
                    <button onClick={() => handleRemoveParticipant(p.id, participantLabel(p))} className="text-xs text-red-600 dark:text-red-400 underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canManageParticipants && (
              <div className="mt-3">
                <div className="mb-3">
                  <InviteLinkButton
                    label="Send pact link"
                    fetchLink={async () => (await client.get(`/invites/pact-link/${pactId}`)).data.url}
                    className="text-xs text-stone-900 dark:text-stone-100 underline"
                  />
                </div>
                <button onClick={() => setShowAddParticipant(!showAddParticipant)} className="text-xs text-stone-900 dark:text-stone-100 underline">
                  {showAddParticipant ? 'Cancel' : '+ Add participant'}
                </button>
                {showAddParticipant && (
                  <form onSubmit={handleAddParticipant} className="flex gap-2 mt-2">
                    <input
                      value={addIdentifier}
                      onChange={(e) => setAddIdentifier(e.target.value)}
                      placeholder="email or username (comma-separated for several)"
                      className="flex-1 border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <button type="submit" className="text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-3 py-1.5">Add</button>
                  </form>
                )}
                {addError && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{addError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
