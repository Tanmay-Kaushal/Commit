import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUserNotifications } from '../api/socket';
import NavBar from '../components/NavBar';
import PactFormFields, { isPactFormValid, type PactFormValues } from '../components/PactFormFields';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SectionMenu from '../components/ui/SectionMenu';
import MenuItem from '../components/ui/MenuItem';
import { useToast } from '../components/ui/Toast';
import { describeMask, maskToDays } from '../weekdays';
import { formatMoney } from '../lib/format';

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

const EMPTY_FORM: PactFormValues = { habitDescription: '', stakeAmount: '', selectedDays: [], startDate: '', endDate: '' };

type FilterOption = 'all' | 'active' | 'pending' | 'closed';
type SortOption = 'start_date' | 'name' | 'stake';

function pactBucket(status: string): FilterOption {
  if (status === 'active') return 'active';
  if (status === 'pending_invite') return 'pending';
  return 'closed'; // closed, completed, cancelled
}

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
  const { show } = useToast();
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PactFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState('');

  const [filter, setFilter] = useState<FilterOption>(
    () => (localStorage.getItem('dashboard_filter') as FilterOption) || 'all'
  );
  const [sort, setSort] = useState<SortOption>(
    () => (localStorage.getItem('dashboard_sort') as SortOption) || 'start_date'
  );
  const [showArchived, setShowArchived] = useState(() => localStorage.getItem('dashboard_show_archived') === '1');

  useEffect(() => localStorage.setItem('dashboard_filter', filter), [filter]);
  useEffect(() => localStorage.setItem('dashboard_sort', sort), [sort]);
  useEffect(() => localStorage.setItem('dashboard_show_archived', showArchived ? '1' : '0'), [showArchived]);

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

  useEffect(() => {
    loadPacts();
    loadFriends();
  }, []);

  useUserNotifications(user?.id, {
    onPactInvite: () => loadPacts(),
    onFriendRequestAccepted: () => loadFriends(),
  });

  const canSubmit = isPactFormValid(form);

  const visiblePacts = useMemo(() => {
    let list = pacts.filter((p) => {
      if (filter !== 'all') return pactBucket(p.status) === filter;
      if (!showArchived && pactBucket(p.status) === 'closed') return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.habit_description.localeCompare(b.habit_description);
      if (sort === 'stake') return b.stake_amount - a.stake_amount;
      return a.start_date.localeCompare(b.start_date);
    });
    return list;
  }, [pacts, filter, sort, showArchived]);

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
      show('Pact created', 'success');
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

  function openEdit(pact: Pact) {
    setEditForm(pactToFormValues(pact));
    setEditingId(pact.id);
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
      show('Pact updated', 'success');
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Could not save changes');
    }
  }

  async function handleCancel(pactId: number) {
    if (!confirm("Cancel this pact? It never activated, so there's nothing to settle.")) return;
    await client.post(`/pacts/${pactId}/cancel`);
    loadPacts();
  }

  async function handleClose(pactId: number) {
    if (!confirm('Close this pact now?')) return;
    await client.post(`/pacts/${pactId}/close`);
    loadPacts();
  }

  async function handleReopen(pactId: number) {
    await client.post(`/pacts/${pactId}/reopen`);
    loadPacts();
  }

  async function handleDelete(pactId: number) {
    if (!confirm('Permanently remove this pact and its history? This cannot be undone.')) return;
    await client.delete(`/pacts/${pactId}`);
    loadPacts();
  }

  async function handleCopyInviteLink() {
    try {
      const res = await client.get('/invites/friend-link');
      await navigator.clipboard.writeText(res.data.url);
      show('Invite link copied', 'success');
    } catch {
      show('Could not get invite link', 'error');
    }
  }

  function statusBadge(pact: Pact) {
    if (pact.status === 'pending_invite') {
      return pendingForMe(pact) ? (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Invite pending — join?</span>
      ) : (
        <span className="text-[var(--graphite)] text-xs">Waiting on others to accept</span>
      );
    }
    if (pact.status === 'cancelled') return <span className="text-red-600 dark:text-red-400 text-xs font-medium">Cancelled</span>;
    if (pact.status === 'completed') return <span className="text-[var(--graphite)] text-xs font-medium">Completed</span>;
    if (pact.status === 'closed') return <span className="text-[var(--graphite)] text-xs font-medium">Closed</span>;
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Active</span>;
  }

  function pendingForMe(pact: Pact) {
    return pact.status === 'pending_invite' && pact.creator_id !== user?.id;
  }

  const FILTERS: { value: FilterOption; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'closed', label: 'Closed/cancelled' },
  ];
  const SORTS: { value: SortOption; label: string }[] = [
    { value: 'start_date', label: 'Start date' },
    { value: 'name', label: 'Name' },
    { value: 'stake', label: 'Stake' },
  ];

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-2">
          <h1 className="font-display text-2xl text-[var(--ink)]">Your pacts</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'New pact'}
            </Button>
            <SectionMenu label="Dashboard options">
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      handleCopyInviteLink();
                      close();
                    }}
                  >
                    Copy invite link
                  </MenuItem>
                  <MenuItem to="/friends" onClick={close}>
                    Add friend
                  </MenuItem>
                  <div className="my-1.5 border-t-2 border-[var(--line)]" />
                  <div className="px-4 pt-1.5 pb-1 text-xs font-semibold text-[var(--graphite)] uppercase tracking-wide">Filter</div>
                  {FILTERS.map((f) => (
                    <MenuItem key={f.value} onClick={() => setFilter(f.value)}>
                      {filter === f.value ? '✓ ' : ''}
                      {f.label}
                    </MenuItem>
                  ))}
                  <div className="my-1.5 border-t-2 border-[var(--line)]" />
                  <div className="px-4 pt-1.5 pb-1 text-xs font-semibold text-[var(--graphite)] uppercase tracking-wide">Sort by</div>
                  {SORTS.map((s) => (
                    <MenuItem key={s.value} onClick={() => setSort(s.value)}>
                      {sort === s.value ? '✓ ' : ''}
                      {s.label}
                    </MenuItem>
                  ))}
                  <div className="my-1.5 border-t-2 border-[var(--line)]" />
                  <MenuItem onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? '✓ ' : ''}Show archived
                  </MenuItem>
                </>
              )}
            </SectionMenu>
          </div>
        </div>

        {showForm && (
          <Card className="p-6 mb-6 space-y-4">
            <form onSubmit={handleCreate} className="space-y-4">
              <PactFormFields values={form} onChange={setForm} />

              <label className="flex items-center gap-2 text-sm text-[var(--graphite)]">
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
                      <label className="text-sm text-[var(--graphite)] block mb-1">Invite a friend</label>
                      <select
                        value={selectedFriendId}
                        onChange={(e) => {
                          setSelectedFriendId(e.target.value);
                          if (e.target.value) setPartnerIdentifier('');
                        }}
                        className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
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
                    <label className="text-sm text-[var(--graphite)] block mb-1">
                      {friends.length > 0 ? 'Or invite by email/username' : "Partner's email or username"}
                    </label>
                    <input
                      value={partnerIdentifier}
                      onChange={(e) => {
                        setPartnerIdentifier(e.target.value);
                        if (e.target.value) setSelectedFriendId('');
                      }}
                      placeholder="partner@example.com or username"
                      className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
                      disabled={selectedFriendId !== ''}
                    />
                  </div>
                </>
              ) : (
                <>
                  {friends.length > 0 && (
                    <div>
                      <label className="text-sm text-[var(--graphite)] block mb-1">Invite friends</label>
                      <div className="flex flex-wrap gap-2">
                        {friends.map((f) => (
                          <label
                            key={f.id}
                            className={`text-xs border-2 border-[var(--ink)] rounded-full px-3 py-1 cursor-pointer transition-colors ${
                              groupFriendIds.includes(String(f.id))
                                ? 'bg-[var(--ink)] text-[var(--paper)]'
                                : 'bg-[var(--paper)] text-[var(--ink)]'
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
                    <label className="text-sm text-[var(--graphite)] block mb-1">Or add more by email/username (comma-separated)</label>
                    <input
                      value={groupExtraIdentifiers}
                      onChange={(e) => setGroupExtraIdentifiers(e.target.value)}
                      placeholder="alice@example.com, bob_j"
                      className="w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
                    />
                  </div>
                </>
              )}

              {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
              <Button type="submit" disabled={!canSubmit}>
                Create pact
              </Button>
            </form>
          </Card>
        )}

        {loading ? (
          <p className="text-[var(--graphite)] text-sm">Loading...</p>
        ) : loadError ? (
          <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            {loadError}
            <Button size="sm" variant="secondary" onClick={loadPacts}>
              Retry
            </Button>
          </div>
        ) : visiblePacts.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[var(--graphite)] text-sm">
              {pacts.length === 0 ? 'No pacts yet. Create one to get started.' : 'Nothing matches this filter.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {visiblePacts.map((pact) => {
              const iAmCreator = pact.creator_id === user?.id;
              const isEditing = editingId === pact.id;

              return (
                <Card key={pact.id} className="p-4">
                  {isEditing ? (
                    <form onSubmit={handleSaveEdit} className="space-y-3">
                      <PactFormFields values={editForm} onChange={setEditForm} />
                      {editError && <p className="text-red-600 dark:text-red-400 text-sm">{editError}</p>}
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          Save changes
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--ink)] truncate">
                          {pact.habit_description}
                          {pact.is_group ? <span className="ml-2 text-xs text-[var(--graphite)] font-normal">(group)</span> : null}
                        </p>
                        <p className="text-sm text-[var(--graphite)]">
                          {describeMask(pact.scheduled_days)} &middot; stake {formatMoney(pact.stake_amount, user?.currency)}/missed day &middot; {statusBadge(pact)}
                        </p>
                        <p className="text-xs text-[var(--graphite)]">
                          {pact.start_date} &rarr; {pact.end_date}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {pendingForMe(pact) ? (
                          <>
                            <Button size="sm" variant="primary" onClick={() => handleAccept(pact.id)}>
                              Accept
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => handleReject(pact.id)}>
                              Reject
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" to={`/pacts/${pact.id}`}>
                            Open
                          </Button>
                        )}

                        {iAmCreator && (
                          <SectionMenu label="Pact options">
                            {(close) => (
                              <>
                                {['pending_invite', 'active'].includes(pact.status) && (
                                  <MenuItem
                                    onClick={() => {
                                      openEdit(pact);
                                      close();
                                    }}
                                  >
                                    Edit pact
                                  </MenuItem>
                                )}
                                {pact.status === 'active' && (
                                  <MenuItem
                                    onClick={() => {
                                      handleClose(pact.id);
                                      close();
                                    }}
                                  >
                                    Close pact
                                  </MenuItem>
                                )}
                                {pact.status === 'pending_invite' && (
                                  <MenuItem
                                    danger
                                    onClick={() => {
                                      handleCancel(pact.id);
                                      close();
                                    }}
                                  >
                                    Cancel pact
                                  </MenuItem>
                                )}
                                {pact.status === 'closed' && (
                                  <MenuItem
                                    onClick={() => {
                                      handleReopen(pact.id);
                                      close();
                                    }}
                                  >
                                    Reopen pact
                                  </MenuItem>
                                )}
                                {['closed', 'completed', 'cancelled'].includes(pact.status) && (
                                  <MenuItem
                                    danger
                                    onClick={() => {
                                      handleDelete(pact.id);
                                      close();
                                    }}
                                  >
                                    Remove pact
                                  </MenuItem>
                                )}
                              </>
                            )}
                          </SectionMenu>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-xs text-[var(--graphite)]">
          {friends.length} friend{friends.length === 1 ? '' : 's'} &middot;{' '}
          <Link to="/friends" className="underline hover:text-[var(--ink)]">
            manage friends
          </Link>
        </p>
      </div>
    </div>
  );
}
