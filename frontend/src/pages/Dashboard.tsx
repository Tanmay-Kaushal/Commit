import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUserNotifications } from '../api/socket';
import NavBar from '../components/NavBar';
import PactFormFields, { isPactFormValid, type PactFormValues } from '../components/PactFormFields';
import { describeMask, maskToDays } from '../weekdays';

type Pact = {
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

type Friend = { id: number; email: string; username: string };
type FriendRequest = { id: number; userId: number; email: string; username: string; created_at: string };

const EMPTY_FORM: PactFormValues = { habitDescription: '', stakeAmount: '', selectedDays: [], startDate: '', endDate: '' };

function pactToFormValues(pact: Pact): PactFormValues {
  return {
    habitDescription: pact.habit_description,
    stakeAmount: String(pact.stake_amount),
    selectedDays: maskToDays(pact.scheduled_days),
    startDate: pact.start_date,
    endDate: pact.end_date,
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState<PactFormValues>(EMPTY_FORM);
  const [isGroup, setIsGroup] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [partnerIdentifier, setPartnerIdentifier] = useState('');
  const [groupFriendIds, setGroupFriendIds] = useState<string[]>([]);
  const [groupExtraIdentifiers, setGroupExtraIdentifiers] = useState('');
  const [error, setError] = useState('');

  const [showFriendForm, setShowFriendForm] = useState(false);
  const [friendIdentifier, setFriendIdentifier] = useState('');
  const [friendError, setFriendError] = useState('');
  // Set when a friend request 404s on an email — offers "Invite to Commit".
  const [noAccountEmail, setNoAccountEmail] = useState<string | null>(null);
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [openFriendId, setOpenFriendId] = useState<number | null>(null);

  // Per-pact 3-dot menu / inline edit (only one open at a time).
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PactFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState('');

  async function loadPacts() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await client.get('/pacts');
      setPacts(res.data);
    } catch (err: any) {
      setLoadError(err.response?.data?.error || 'Could not load your pacts. Try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }

  async function loadFriends() {
    try {
      const res = await client.get('/friends');
      setFriends(res.data);
    } catch {}
  }

  async function loadRequests() {
    try {
      const res = await client.get('/friends/requests');
      setIncomingRequests(res.data.incoming);
      setOutgoingRequests(res.data.outgoing);
    } catch {}
  }

  useEffect(() => {
    loadPacts();
    loadFriends();
    loadRequests();
  }, []);

  useUserNotifications(user?.id, {
    onPactInvite: () => loadPacts(),
    onFriendRequest: () => loadRequests(),
    onFriendRequestAccepted: () => {
      loadFriends();
      loadRequests();
    },
  });

  // A partner is optional — a pact can be created solo, shared via link later.
  const canSubmit = isPactFormValid(form);

  function toggleGroupFriend(id: string) {
    setGroupFriendIds((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));
  }

  function resetPactForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setIsGroup(false);
    setSelectedFriendId('');
    setPartnerIdentifier('');
    setGroupFriendIds([]);
    setGroupExtraIdentifiers('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Please fill in every field before creating a pact');
      return;
    }

    let partnerIdentifiers: string[];
    if (isGroup) {
      const fromFriends = groupFriendIds.map((id) => friends.find((f) => String(f.id) === id)?.username || '');
      const fromText = groupExtraIdentifiers.split(',').map((s) => s.trim()).filter(Boolean);
      partnerIdentifiers = [...fromFriends, ...fromText].filter(Boolean);
    } else {
      const identifier = selectedFriendId
        ? friends.find((f) => String(f.id) === selectedFriendId)?.username || ''
        : partnerIdentifier.trim();
      partnerIdentifiers = identifier ? [identifier] : [];
    }

    try {
      await client.post('/pacts', {
        habitDescription: form.habitDescription,
        stakeAmount: Number(form.stakeAmount),
        scheduledDays: form.selectedDays,
        startDate: form.startDate,
        endDate: form.endDate,
        partnerIdentifiers,
      });
      resetPactForm();
      loadPacts();
      loadFriends();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not create pact');
    }
  }

  async function handleAccept(pactId: number) {
    await client.post(`/pacts/${pactId}/accept`);
    loadPacts();
    loadFriends();
  }

  async function handleReject(pactId: number) {
    await client.post(`/pacts/${pactId}/reject`);
    loadPacts();
  }

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault();
    setFriendError('');
    setNoAccountEmail(null);
    setInviteEmailStatus('idle');
    const identifier = friendIdentifier.trim();
    try {
      const res = await client.post('/friends/requests', { identifier });
      setFriendIdentifier('');
      setShowFriendForm(false);
      if (res.data.status === 'accepted') loadFriends();
      else loadRequests();
    } catch (err: any) {
      setFriendError(err.response?.data?.error || 'Could not send friend request');
      // Only email identifiers can be invited, not usernames.
      if (err.response?.status === 404 && identifier.includes('@')) {
        setNoAccountEmail(identifier.toLowerCase());
      }
    }
  }

  async function handleInviteToCommit() {
    if (!noAccountEmail) return;
    setInviteEmailStatus('sending');
    setFriendError('');
    try {
      await client.post('/invites/email', { email: noAccountEmail });
      setInviteEmailStatus('sent');
    } catch (err: any) {
      setInviteEmailStatus('idle');
      setFriendError(err.response?.data?.error || 'Could not send the invite');
    }
  }

  async function handleAcceptRequest(id: number) {
    await client.post(`/friends/requests/${id}/accept`);
    loadFriends();
    loadRequests();
  }

  async function handleRejectRequest(id: number) {
    await client.post(`/friends/requests/${id}/reject`);
    loadRequests();
  }

  async function handleRemoveFriend(id: number) {
    await client.delete(`/friends/${id}`);
    setOpenFriendId(null);
    loadFriends();
  }

  // ---- 3-dot menu actions (creator only) ----

  function openEdit(pact: Pact) {
    setEditForm(pactToFormValues(pact));
    setEditingId(pact.id);
    setOpenMenuId(null);
    setEditError('');
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError('');
    if (!isPactFormValid(editForm)) {
      setEditError('Fill in every field');
      return;
    }
    try {
      await client.put(`/pacts/${editingId}`, {
        habitDescription: editForm.habitDescription,
        stakeAmount: Number(editForm.stakeAmount),
        scheduledDays: editForm.selectedDays,
        startDate: editForm.startDate,
        endDate: editForm.endDate,
      });
      setEditingId(null);
      loadPacts();
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Could not save changes');
    }
  }

  async function handleCancel(pactId: number) {
    if (!confirm('Cancel this pact? It never activated, so there\'s nothing to settle.')) return;
    setOpenMenuId(null);
    await client.post(`/pacts/${pactId}/cancel`);
    loadPacts();
  }

  async function handleClose(pactId: number) {
    if (!confirm('Close this pact now?')) return;
    setOpenMenuId(null);
    await client.post(`/pacts/${pactId}/close`);
    loadPacts();
  }

  async function handleReopen(pactId: number) {
    setOpenMenuId(null);
    await client.post(`/pacts/${pactId}/reopen`);
    loadPacts();
  }

  async function handleDelete(pactId: number) {
    if (!confirm('Permanently remove this pact and its history? This cannot be undone.')) return;
    setOpenMenuId(null);
    await client.delete(`/pacts/${pactId}`);
    loadPacts();
  }

  function statusBadge(pact: Pact) {
    if (pact.status === 'pending_invite') {
      return pendingForMe(pact) ? (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Invite pending — join?</span>
      ) : (
        <span className="text-stone-400 dark:text-stone-500 text-xs">Waiting on others to accept</span>
      );
    }
    if (pact.status === 'cancelled') return <span className="text-red-500 dark:text-red-400 text-xs font-medium">Cancelled</span>;
    if (pact.status === 'completed') return <span className="text-stone-500 dark:text-stone-400 text-xs font-medium">Completed</span>;
    if (pact.status === 'closed') return <span className="text-stone-500 dark:text-stone-400 text-xs font-medium">Closed</span>;
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Active</span>;
  }

  function pendingForMe(pact: Pact) {
    return pact.status === 'pending_invite' && pact.creator_id !== user?.id;
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Your pacts</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition"
          >
            {showForm ? 'Cancel' : 'New pact'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mb-6 space-y-4">
            <PactFormFields values={form} onChange={setForm} />

            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
              <input
                type="checkbox"
                checked={isGroup}
                onChange={(e) => {
                  setIsGroup(e.target.checked);
                  setSelectedFriendId('');
                  setPartnerIdentifier('');
                  setGroupFriendIds([]);
                  setGroupExtraIdentifiers('');
                }}
              />
              Make this a group pact (more than one partner)
            </label>

            {!isGroup ? (
              <>
                {friends.length > 0 && (
                  <div>
                    <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Invite a friend</label>
                    <select
                      value={selectedFriendId}
                      onChange={(e) => {
                        setSelectedFriendId(e.target.value);
                        if (e.target.value) setPartnerIdentifier('');
                      }}
                      className="w-full border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 dark:text-stone-100"
                    >
                      <option value="">Choose from your friends...</option>
                      {friends.map((f) => (
                        <option key={f.id} value={f.id}>{f.username} ({f.email})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">
                    {friends.length > 0 ? 'Or invite by email/username' : "Partner's email or username"}
                  </label>
                  <input
                    value={partnerIdentifier}
                    onChange={(e) => {
                      setPartnerIdentifier(e.target.value);
                      if (e.target.value) setSelectedFriendId('');
                    }}
                    placeholder="partner@example.com or username"
                    className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
                    disabled={selectedFriendId !== ''}
                  />
                </div>
              </>
            ) : (
              <>
                {friends.length > 0 && (
                  <div>
                    <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Invite friends</label>
                    <div className="flex flex-wrap gap-2">
                      {friends.map((f) => (
                        <label
                          key={f.id}
                          className={`text-xs border rounded-full px-3 py-1 cursor-pointer transition ${
                            groupFriendIds.includes(String(f.id))
                              ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100'
                              : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-300 dark:border-stone-700'
                          }`}
                        >
                          <input type="checkbox" className="hidden" checked={groupFriendIds.includes(String(f.id))} onChange={() => toggleGroupFriend(String(f.id))} />
                          {f.username}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Or add more by email/username (comma-separated)</label>
                  <input
                    value={groupExtraIdentifiers}
                    onChange={(e) => setGroupExtraIdentifiers(e.target.value)}
                    placeholder="alice@example.com, bob_j"
                    className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create pact
            </button>
          </form>
        )}

        {incomingRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-3">Friend requests</h2>
            <div className="space-y-2">
              {incomingRequests.map((r) => (
                <div key={r.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-stone-900 dark:text-stone-100">{r.username} ({r.email})</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleAcceptRequest(r.id)} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5">Accept</button>
                    <button onClick={() => handleRejectRequest(r.id)} className="text-sm bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-1.5">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">Friends</h2>
          <button onClick={() => setShowFriendForm(!showFriendForm)} className="text-sm text-stone-900 dark:text-stone-100 underline">
            {showFriendForm ? 'Cancel' : 'Add friend'}
          </button>
        </div>

        {showFriendForm && (
          <form onSubmit={handleAddFriend} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 mb-4 flex gap-2 items-start">
            <div className="flex-1">
              <input
                value={friendIdentifier}
                onChange={(e) => setFriendIdentifier(e.target.value)}
                placeholder="Email or username"
                className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
              />
              {friendError && <p className="text-red-600 dark:text-red-400 text-sm mt-1">{friendError}</p>}
              {noAccountEmail && (
                <button
                  type="button"
                  onClick={handleInviteToCommit}
                  disabled={inviteEmailStatus !== 'idle'}
                  className="text-sm text-stone-900 dark:text-stone-100 underline mt-1 disabled:opacity-40"
                >
                  {inviteEmailStatus === 'sent' ? 'Invite sent!' : inviteEmailStatus === 'sending' ? 'Sending...' : `Invite ${noAccountEmail} to Commit`}
                </button>
              )}
            </div>
            <button type="submit" className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition">
              Send request
            </button>
          </form>
        )}

        {(friends.length > 0 || outgoingRequests.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {friends.map((f) =>
              openFriendId === f.id ? (
                <span key={f.id} className="text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-full pl-3 pr-1 py-1 text-stone-600 dark:text-stone-400 flex items-center gap-2">
                  {f.username}
                  <button onClick={() => handleRemoveFriend(f.id)} className="text-red-600 dark:text-red-400 font-medium hover:text-red-700 dark:hover:text-red-300">Remove</button>
                  <button onClick={() => setOpenFriendId(null)} className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="Cancel">&times;</button>
                </span>
              ) : (
                <button key={f.id} onClick={() => setOpenFriendId(f.id)} className="text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-full px-3 py-1 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500 transition">
                  {f.username}
                </button>
              )
            )}
            {outgoingRequests.map((r) => (
              <span key={`out-${r.id}`} className="text-xs bg-white dark:bg-stone-900 border border-dashed border-stone-300 dark:border-stone-700 rounded-full px-3 py-1 text-stone-400 dark:text-stone-500">
                {r.username} (requested)
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">Loading...</p>
        ) : loadError ? (
          <div className="text-sm text-red-600 dark:text-red-400">
            {loadError} <button onClick={loadPacts} className="underline">Retry</button>
          </div>
        ) : pacts.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">No pacts yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {pacts.map((pact) => {
              const iAmCreator = pact.creator_id === user?.id;
              const isEditing = editingId === pact.id;

              return (
                <div key={pact.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
                  {isEditing ? (
                    <form onSubmit={handleSaveEdit} className="space-y-3">
                      <PactFormFields values={editForm} onChange={setEditForm} />
                      {editError && <p className="text-red-600 dark:text-red-400 text-sm">{editError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" className="text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-3 py-1.5">Save changes</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-sm text-stone-500 dark:text-stone-400 underline">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          {pact.habit_description}
                          {pact.is_group ? <span className="ml-2 text-xs text-stone-400 dark:text-stone-500 font-normal">(group)</span> : null}
                        </p>
                        <p className="text-sm text-stone-500 dark:text-stone-400">
                          {describeMask(pact.scheduled_days)} &middot; stake {pact.stake_amount}/missed day &middot; {statusBadge(pact)}
                        </p>
                        <p className="text-xs text-stone-400 dark:text-stone-500">{pact.start_date} &rarr; {pact.end_date}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {pendingForMe(pact) ? (
                          <>
                            <button onClick={() => handleAccept(pact.id)} className="bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition">Accept</button>
                            <button onClick={() => handleReject(pact.id)} className="bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-stone-300 dark:hover:bg-stone-600 transition">Reject</button>
                          </>
                        ) : (
                          <Link to={`/pacts/${pact.id}`} className="text-stone-900 dark:text-stone-100 text-sm font-medium underline">Open</Link>
                        )}

                        {iAmCreator && (
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === pact.id ? null : pact.id)}
                              className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 px-1"
                              aria-label="Pact options"
                            >
                              &#8942;
                            </button>
                            {openMenuId === pact.id && (
                              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-10 py-1 text-sm">
                                {['pending_invite', 'active'].includes(pact.status) && (
                                  <button onClick={() => openEdit(pact)} className="block w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200">
                                    Edit pact
                                  </button>
                                )}
                                {pact.status === 'active' && (
                                  <button onClick={() => handleClose(pact.id)} className="block w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200">
                                    Close pact
                                  </button>
                                )}
                                {pact.status === 'pending_invite' && (
                                  <button onClick={() => handleCancel(pact.id)} className="block w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400">
                                    Cancel pact
                                  </button>
                                )}
                                {pact.status === 'closed' && (
                                  <button onClick={() => handleReopen(pact.id)} className="block w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200">
                                    Reopen pact
                                  </button>
                                )}
                                {['closed', 'completed', 'cancelled'].includes(pact.status) && (
                                  <button onClick={() => handleDelete(pact.id)} className="block w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400">
                                    Remove pact
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
