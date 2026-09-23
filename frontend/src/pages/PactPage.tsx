import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePactUpdates } from '../api/socket';
import NavBar from '../components/NavBar';
import InviteLinkButton from '../components/InviteLinkButton';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SectionMenu from '../components/ui/SectionMenu';
import MenuItem from '../components/ui/MenuItem';
import { useToast } from '../components/ui/Toast';
import PactFormFields, { isPactFormValid, type PactFormValues } from '../components/PactFormFields';
import { describeMask, maskToDays } from '../weekdays';
import { formatMoney } from '../lib/format';

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

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PactPage() {
  const { id } = useParams();
  const pactId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const [data, setData] = useState<PactDetail | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [addIdentifier, setAddIdentifier] = useState('');
  const [addError, setAddError] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<PactFormValues | null>(null);
  const [editError, setEditError] = useState('');

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

  function openEdit() {
    if (!data) return;
    setEditForm({
      habitDescription: data.pact.habit_description,
      stakeAmount: String(data.pact.stake_amount),
      selectedDays: maskToDays(data.pact.scheduled_days),
      startDate: data.pact.start_date,
      endDate: data.pact.end_date,
    });
    setEditError('');
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setEditError('');
    if (!isPactFormValid(editForm)) {
      setEditError('Fill in every field');
      return;
    }
    try {
      await client.put(`/pacts/${pactId}`, {
        habitDescription: editForm.habitDescription,
        stakeAmount: Number(editForm.stakeAmount),
        scheduledDays: editForm.selectedDays,
        startDate: editForm.startDate,
        endDate: editForm.endDate,
      });
      setEditing(false);
      load();
      show('Pact updated', 'success');
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Could not save changes');
    }
  }

  async function handleShareLink() {
    try {
      const res = await client.get(`/invites/pact-link/${pactId}`);
      await navigator.clipboard.writeText(res.data.url);
      show('Pact link copied', 'success');
    } catch {
      show('Could not get pact link', 'error');
    }
  }

  function handleExportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [['date', 'participant', 'completed', 'amount']];
    for (const day of data.history) {
      for (const s of day.settlements) {
        rows.push([day.scheduled_date, s.username || s.email, s.completed ? 'yes' : 'no', (s.amount_cents / 100).toFixed(2)]);
      }
    }
    downloadCsv(`${data.pact.habit_description.replace(/[^a-z0-9]+/gi, '_')}_history.csv`, rows);
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--paper)]">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-8 text-sm">
          {loadError ? (
            <p className="text-red-600 dark:text-red-400 flex items-center gap-2">
              {loadError}
              <Button size="sm" variant="secondary" onClick={load}>
                Retry
              </Button>
            </p>
          ) : (
            <p className="text-[var(--graphite)]">Loading...</p>
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
  const currency = user?.currency;

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-[var(--graphite)] underline hover:text-[var(--ink)]">
            &larr; Back to pacts
          </Link>
          <SectionMenu label="Pact options">
            {(close) => (
              <>
                <MenuItem to={`/pacts/${pactId}/timeline`} onClick={close}>
                  View history
                </MenuItem>
                {iAmCreator && canManageParticipants && (
                  <MenuItem
                    onClick={() => {
                      setShowAddParticipant(true);
                      close();
                    }}
                  >
                    Add participant
                  </MenuItem>
                )}
                {iAmCreator && canManageParticipants && (
                  <MenuItem
                    onClick={() => {
                      handleShareLink();
                      close();
                    }}
                  >
                    Share pact link
                  </MenuItem>
                )}
                {iAmCreator && ['pending_invite', 'active'].includes(pact.status) && (
                  <MenuItem
                    onClick={() => {
                      openEdit();
                      close();
                    }}
                  >
                    Pact settings
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    handleExportCsv();
                    close();
                  }}
                >
                  Export CSV
                </MenuItem>
                {iAmActive && !iAmCreator && (
                  <MenuItem
                    danger
                    onClick={() => {
                      close();
                      handleLeave();
                    }}
                  >
                    Leave pact
                  </MenuItem>
                )}
              </>
            )}
          </SectionMenu>
        </div>

        <Card className="p-6 mt-4">
          {editing && editForm ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <h2 className="font-display text-lg text-[var(--ink)]">Pact settings</h2>
              <PactFormFields values={editForm} onChange={setEditForm} />
              {editError && <p className="text-red-600 dark:text-red-400 text-sm">{editError}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Save changes
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-xl text-[var(--ink)]">
                    {pact.habit_description}
                    {pact.is_group ? <span className="ml-2 text-xs text-[var(--graphite)] font-normal">(group)</span> : null}
                  </h1>
                  <p className="text-sm text-[var(--graphite)] mt-1">
                    {describeMask(pact.scheduled_days)} &middot; stake {formatMoney(pact.stake_amount, currency)} per missed day
                  </p>
                  <p className="text-xs text-[var(--graphite)]">
                    {pact.start_date} &rarr; {pact.end_date}
                  </p>
                </div>
                {iAmCreator && (
                  <span className="text-xs border-2 border-[var(--ink)] text-[var(--ink)] rounded-full px-2 py-1 shrink-0">Creator</span>
                )}
              </div>

              {iAmPendingHere ? (
                <div className="mt-6 bg-amber-50 dark:bg-amber-950 border-2 border-amber-400 dark:border-amber-700 rounded-xl p-4">
                  <p className="text-amber-700 dark:text-amber-400 text-sm mb-3">You've been invited to this pact.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={handleAccept}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleReject}>
                      Reject
                    </Button>
                  </div>
                </div>
              ) : pact.status === 'pending_invite' ? (
                <p className="text-amber-600 dark:text-amber-400 text-sm mt-4">
                  {pact.start_date > new Date().toISOString().slice(0, 10)
                    ? `Waiting for a partner to accept. This activates once ${pact.start_date} arrives, if someone's said yes by then.`
                    : "Waiting for a partner to accept — it'll activate the moment one does."}
                </p>
              ) : pact.status === 'cancelled' ? (
                <p className="text-red-600 dark:text-red-400 text-sm mt-4">This pact was cancelled by its creator.</p>
              ) : pact.status === 'completed' ? (
                <p className="text-[var(--graphite)] text-sm mt-4">
                  This pact ran its full course ({pact.start_date} to {pact.end_date}).
                </p>
              ) : pact.status === 'closed' ? (
                <p className="text-[var(--graphite)] text-sm mt-4">This pact was closed early by its creator.</p>
              ) : (
                <>
                  {todayPactDay && (
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      {activeParticipants.map((p) => {
                        const checkedIn = todayCheckIns.some((c) => c.user_id === p.user_id);
                        const isMe = p.user_id === user?.id;
                        return (
                          <div key={p.id} className="border-2 border-[var(--line)] rounded-xl p-4">
                            <p className="text-sm text-[var(--graphite)] mb-1">{isMe ? 'You' : participantLabel(p)}</p>
                            <p className={`font-medium ${checkedIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--graphite)]'}`}>
                              {checkedIn ? 'Checked in' : 'Not yet'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!todayPactDay && <p className="text-sm text-[var(--graphite)] mt-6">Today isn't a scheduled day for this pact.</p>}

                  {todayPactDay?.status === 'pending' && iAmActive && (
                    <div className="mt-6 flex items-center gap-3">
                      <Button onClick={handleCheckIn} disabled={myCheckedInToday}>
                        {myCheckedInToday ? 'Already checked in today' : 'Check in for today'}
                      </Button>
                      {myCheckedInToday && (
                        <Button variant="ghost" size="sm" onClick={handleUncheckIn}>
                          Undo (checked in by mistake)
                        </Button>
                      )}
                    </div>
                  )}

                  {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}

                  {history.length > 0 && (
                    <div className="mt-8 border-t-2 border-[var(--line)] pt-6">
                      <h2 className="text-sm font-medium text-[var(--graphite)] mb-3">History (most recent first)</h2>
                      <div className="space-y-4">
                        {history.map((day) => {
                          const disputesForOthers = day.disputes.filter((d) => d.user_id !== user?.id);
                          const myDisputeAlreadyRaised = day.disputes.some((d) => d.user_id === user?.id);
                          const mySettlement = day.settlements.find((s) => s.user_id === user?.id);
                          const canIDispute = mySettlement && !mySettlement.completed && !myDisputeAlreadyRaised;
                          const everyoneCompleted = day.settlements.every((s) => s.completed);

                          return (
                            <div key={day.id} className="border-2 border-[var(--line)] rounded-xl p-4">
                              <p className="text-xs font-medium text-[var(--graphite)] mb-2">{day.scheduled_date}</p>

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
                                          <span className="text-[var(--ink)]">{label}</span>{' '}
                                          <span className="text-xs text-[var(--graphite)]">{s.completed ? 'completed' : 'missed'}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          {isForfeit && <span className="text-red-600 dark:text-red-400 font-medium">Owes {formatMoney(amount, currency)}</span>}
                                          {isReceipt && <span className="text-emerald-600 dark:text-emerald-400 font-medium">Gets {formatMoney(amount, currency)}</span>}
                                          {s.amount_cents === 0 && !s.completed && <span className="text-[var(--graphite)]">No one to pay</span>}
                                          {isForfeit && s.settled === 1 && <span className="text-xs text-[var(--graphite)]">Paid &#10003;</span>}
                                          {canConfirm && (
                                            <Button size="sm" variant="ghost" onClick={() => handleConfirmSettlement(s.id)}>
                                              Confirm paid
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {canIDispute && (
                                <Button size="sm" variant="ghost" className="mt-3 !text-red-700 dark:!text-red-400" onClick={() => handleDispute(day.id)}>
                                  I did it but forgot to log it
                                </Button>
                              )}
                              {myDisputeAlreadyRaised && (
                                <p className="text-amber-600 dark:text-amber-400 text-xs mt-3">Your dispute is waiting on another participant to resolve it.</p>
                              )}
                              {disputesForOthers.map((d) => (
                                <div key={d.id} className="bg-amber-50 dark:bg-amber-950 border-2 border-amber-400 dark:border-amber-700 rounded-xl p-3 mt-3">
                                  <p className="text-amber-700 dark:text-amber-400 text-xs mb-2">
                                    {d.username || d.email} disputes being marked as missed.
                                  </p>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="primary" onClick={() => handleResolveDispute(day.id, d.user_id, true)}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleResolveDispute(day.id, d.user_id, false)}>
                                      Reject
                                    </Button>
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

              <Link to={`/pacts/${pactId}/timeline`} className="block mt-6 text-sm text-[var(--graphite)] underline hover:text-[var(--ink)]">
                View full event log
              </Link>
            </>
          )}
        </Card>

        {iAmCreator && (
          <Card className="p-6 mt-4">
            <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">Participants</h2>
            <div className="space-y-1.5">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--ink)]">
                    {p.is_creator ? `${participantLabel(p)} (you, creator)` : participantLabel(p)}
                    <span className="text-xs text-[var(--graphite)] ml-2">{PARTICIPANT_STATUS_LABELS[p.status] || p.status}</span>
                  </span>
                  {removableParticipants.some((r) => r.id === p.id) && (
                    <Button size="sm" variant="ghost" className="!text-red-600 dark:!text-red-400" onClick={() => handleRemoveParticipant(p.id, participantLabel(p))}>
                      Remove
                    </Button>
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
                    className="text-xs text-[var(--ink)] underline"
                  />
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowAddParticipant(!showAddParticipant)}>
                  {showAddParticipant ? 'Cancel' : '+ Add participant'}
                </Button>
                {showAddParticipant && (
                  <form onSubmit={handleAddParticipant} className="flex gap-2 mt-2">
                    <input
                      value={addIdentifier}
                      onChange={(e) => setAddIdentifier(e.target.value)}
                      placeholder="email or username (comma-separated for several)"
                      className="flex-1 border-2 border-[var(--ink)] rounded-xl px-3 py-1.5 text-sm bg-[var(--paper)] text-[var(--ink)]"
                    />
                    <Button type="submit" size="sm">
                      Add
                    </Button>
                  </form>
                )}
                {addError && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{addError}</p>}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
