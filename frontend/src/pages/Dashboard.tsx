import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUserNotifications } from '../api/socket';
import NavBar from '../components/NavBar';

type Pact = {
  id: number;
  creator_id: number;
  partner_id: number | null;
  partner_email: string;
  habit_description: string;
  frequency_per_week: number;
  stake_amount: number;
  cycle_length_days: number;
  status: string;
  is_group: number;
};

type Friend = {
  id: number;
  email: string;
  username: string;
};

type FriendRequest = {
  id: number;
  userId: number;
  email: string;
  username: string;
  created_at: string;
};

// Number inputs start empty (not 0) so the placeholder is visible and the
// user isn't stuck deleting a "0" before typing. We track them as strings
// and only convert to a number on submit.
export default function Dashboard() {
  const { user } = useAuth();
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // pact form state
  const [habitDescription, setHabitDescription] = useState('');
  const [frequencyPerWeek, setFrequencyPerWeek] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [cycleLengthDays, setCycleLengthDays] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [partnerIdentifier, setPartnerIdentifier] = useState('');
  const [groupFriendIds, setGroupFriendIds] = useState<string[]>([]);
  const [groupExtraIdentifiers, setGroupExtraIdentifiers] = useState('');
  const [error, setError] = useState('');

  // add-friend form state
  const [showFriendForm, setShowFriendForm] = useState(false);
  const [friendIdentifier, setFriendIdentifier] = useState('');
  const [friendError, setFriendError] = useState('');
  const [openFriendId, setOpenFriendId] = useState<number | null>(null);

  async function loadPacts() {
    setLoading(true);
    const res = await client.get('/pacts');
    setPacts(res.data);
    setLoading(false);
  }

  async function loadFriends() {
    const res = await client.get('/friends');
    setFriends(res.data);
  }

  async function loadRequests() {
    const res = await client.get('/friends/requests');
    setIncomingRequests(res.data.incoming);
    setOutgoingRequests(res.data.outgoing);
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

  // Required numeric fields must all be non-empty (not just non-zero) before
  // the create button is enabled — an empty string means "not yet entered"
  // rather than defaulting to 0.
  const numericFieldsFilled =
    frequencyPerWeek.trim() !== '' && stakeAmount.trim() !== '' && cycleLengthDays.trim() !== '';
  const hasPartner = isGroup
    ? groupFriendIds.length > 0 || groupExtraIdentifiers.trim() !== ''
    : selectedFriendId !== '' || partnerIdentifier.trim() !== '';
  const canSubmit = habitDescription.trim() !== '' && numericFieldsFilled && hasPartner;

  function handleNumberChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      // allow empty string and digits only — no forced leading zero
      const val = e.target.value;
      if (val === '' || /^[0-9]+$/.test(val)) {
        setter(val);
      }
    };
  }

  function toggleGroupFriend(id: string) {
    setGroupFriendIds((current) =>
      current.includes(id) ? current.filter((f) => f !== id) : [...current, id]
    );
  }

  function resetPactForm() {
    setShowForm(false);
    setHabitDescription('');
    setFrequencyPerWeek('');
    setStakeAmount('');
    setCycleLengthDays('');
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
      const fromFriends = groupFriendIds.map(
        (id) => friends.find((f) => String(f.id) === id)?.username || ''
      );
      const fromText = groupExtraIdentifiers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      partnerIdentifiers = [...fromFriends, ...fromText].filter(Boolean);
    } else {
      const identifier = selectedFriendId
        ? friends.find((f) => String(f.id) === selectedFriendId)?.username || ''
        : partnerIdentifier.trim();
      partnerIdentifiers = [identifier];
    }

    try {
      await client.post('/pacts', {
        habitDescription,
        frequencyPerWeek: Number(frequencyPerWeek),
        stakeAmount: Number(stakeAmount),
        cycleLengthDays: Number(cycleLengthDays),
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
    try {
      const res = await client.post('/friends/requests', { identifier: friendIdentifier.trim() });
      setFriendIdentifier('');
      setShowFriendForm(false);
      if (res.data.status === 'accepted') {
        loadFriends();
      } else {
        loadRequests();
      }
    } catch (err: any) {
      setFriendError(err.response?.data?.error || 'Could not send friend request');
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

  function statusBadge(pact: Pact) {
    if (pact.status === 'pending_invite') {
      const iAmPending = pendingForMe(pact);
      if (iAmPending) {
        return <span className="text-amber-600 text-xs font-medium">Invite pending — join?</span>;
      }
      return <span className="text-stone-400 text-xs">Waiting on others to accept</span>;
    }
    if (pact.status === 'declined') {
      return <span className="text-red-500 text-xs font-medium">Declined</span>;
    }
    return <span className="text-emerald-600 text-xs font-medium">Active</span>;
  }

  // We don't get per-participant status in the list endpoint, so treat any
  // pending_invite pact where I'm not the creator as something I might
  // still need to respond to; opening it will show the real per-user state.
  function pendingForMe(pact: Pact) {
    return pact.status === 'pending_invite' && pact.creator_id !== user?.id;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-stone-900">Your pacts</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition"
          >
            {showForm ? 'Cancel' : 'New pact'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white border border-stone-200 rounded-xl p-6 mb-6 space-y-4"
          >
            <div>
              <label className="text-sm text-stone-600 block mb-1">Habit</label>
              <input
                value={habitDescription}
                onChange={(e) => setHabitDescription(e.target.value)}
                placeholder="e.g. Run 3x a week"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-stone-600 block mb-1">Times per week</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={frequencyPerWeek}
                  onChange={handleNumberChange(setFrequencyPerWeek)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-stone-600 block mb-1">Cycle length (days)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 7"
                  value={cycleLengthDays}
                  onChange={handleNumberChange(setCycleLengthDays)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-stone-600 block mb-1">Stake amount (per person)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 100"
                value={stakeAmount}
                onChange={handleNumberChange(setStakeAmount)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-600">
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
                    <label className="text-sm text-stone-600 block mb-1">Invite a friend</label>
                    <select
                      value={selectedFriendId}
                      onChange={(e) => {
                        setSelectedFriendId(e.target.value);
                        if (e.target.value) setPartnerIdentifier('');
                      }}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Choose from your friends...</option>
                      {friends.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.username} ({f.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm text-stone-600 block mb-1">
                    {friends.length > 0 ? 'Or invite by email/username' : "Partner's email or username"}
                  </label>
                  <input
                    value={partnerIdentifier}
                    onChange={(e) => {
                      setPartnerIdentifier(e.target.value);
                      if (e.target.value) setSelectedFriendId('');
                    }}
                    placeholder="partner@example.com or username"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                    disabled={selectedFriendId !== ''}
                  />
                </div>
              </>
            ) : (
              <>
                {friends.length > 0 && (
                  <div>
                    <label className="text-sm text-stone-600 block mb-1">Invite friends</label>
                    <div className="flex flex-wrap gap-2">
                      {friends.map((f) => (
                        <label
                          key={f.id}
                          className={`text-xs border rounded-full px-3 py-1 cursor-pointer transition ${
                            groupFriendIds.includes(String(f.id))
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-white text-stone-600 border-stone-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={groupFriendIds.includes(String(f.id))}
                            onChange={() => toggleGroupFriend(String(f.id))}
                          />
                          {f.username}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm text-stone-600 block mb-1">
                    Or add more by email/username (comma-separated)
                  </label>
                  <input
                    value={groupExtraIdentifiers}
                    onChange={(e) => setGroupExtraIdentifiers(e.target.value)}
                    placeholder="alice@example.com, bob_j"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create pact
            </button>
          </form>
        )}

        {incomingRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-stone-600 mb-3">Friend requests</h2>
            <div className="space-y-2">
              {incomingRequests.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <span className="text-sm text-stone-900">{r.username} ({r.email})</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptRequest(r.id)}
                      className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectRequest(r.id)}
                      className="text-sm bg-stone-200 text-stone-700 rounded-lg px-3 py-1.5"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-stone-600">Friends</h2>
          <button
            onClick={() => setShowFriendForm(!showFriendForm)}
            className="text-sm text-stone-900 underline"
          >
            {showFriendForm ? 'Cancel' : 'Add friend'}
          </button>
        </div>

        {showFriendForm && (
          <form
            onSubmit={handleAddFriend}
            className="bg-white border border-stone-200 rounded-xl p-4 mb-4 flex gap-2 items-start"
          >
            <div className="flex-1">
              <input
                value={friendIdentifier}
                onChange={(e) => setFriendIdentifier(e.target.value)}
                placeholder="Email or username"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
              />
              {friendError && <p className="text-red-600 text-sm mt-1">{friendError}</p>}
            </div>
            <button
              type="submit"
              className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition"
            >
              Send request
            </button>
          </form>
        )}

        {(friends.length > 0 || outgoingRequests.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {friends.map((f) =>
              openFriendId === f.id ? (
                <span
                  key={f.id}
                  className="text-xs bg-white border border-stone-300 rounded-full pl-3 pr-1 py-1 text-stone-600 flex items-center gap-2"
                >
                  {f.username}
                  <button
                    onClick={() => handleRemoveFriend(f.id)}
                    className="text-red-600 font-medium hover:text-red-700"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setOpenFriendId(null)}
                    className="text-stone-400 hover:text-stone-600"
                    aria-label="Cancel"
                  >
                    &times;
                  </button>
                </span>
              ) : (
                <button
                  key={f.id}
                  onClick={() => setOpenFriendId(f.id)}
                  className="text-xs bg-white border border-stone-200 rounded-full px-3 py-1 text-stone-600 hover:border-stone-400 transition"
                >
                  {f.username}
                </button>
              )
            )}
            {outgoingRequests.map((r) => (
              <span
                key={`out-${r.id}`}
                className="text-xs bg-white border border-dashed border-stone-300 rounded-full px-3 py-1 text-stone-400"
              >
                {r.username} (requested)
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : pacts.length === 0 ? (
          <p className="text-stone-400 text-sm">No pacts yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {pacts.map((pact) => (
              <div
                key={pact.id}
                className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-stone-900">
                    {pact.habit_description}
                    {pact.is_group ? (
                      <span className="ml-2 text-xs text-stone-400 font-normal">(group)</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-stone-500">
                    {pact.frequency_per_week}x/week &middot; stake {pact.stake_amount} &middot;{' '}
                    {statusBadge(pact)}
                  </p>
                </div>
                {pendingForMe(pact) ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(pact.id)}
                      className="bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleReject(pact.id)}
                      className="bg-stone-200 text-stone-700 text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-stone-300 transition"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <Link
                    to={`/pacts/${pact.id}`}
                    className="text-stone-900 text-sm font-medium underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
