import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserNotifications } from '../api/socket';
import client from '../api/client';
import NavBar from '../components/NavBar';
import InviteLinkButton from '../components/InviteLinkButton';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';

type Friend = { id: number; email: string; username: string; sharedPacts: number };
type FriendRequest = { id: number; userId: number; email: string; username: string; created_at: string };

export default function FriendsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [noAccountFound, setNoAccountFound] = useState(false);

  async function loadFriends() {
    try {
      const res = await client.get('/friends');
      setFriends(res.data);
    } catch {}
  }

  async function loadRequests() {
    try {
      const res = await client.get('/friends/requests');
      setIncoming(res.data.incoming);
      setOutgoing(res.data.outgoing);
    } catch {}
  }

  useEffect(() => {
    Promise.all([loadFriends(), loadRequests()]).finally(() => setLoading(false));
  }, []);

  useUserNotifications(user?.id, {
    onFriendRequest: () => loadRequests(),
    onFriendRequestAccepted: () => {
      loadFriends();
      loadRequests();
    },
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNoAccountFound(false);
    const value = identifier.trim();
    if (!value) return;
    try {
      const res = await client.post('/friends/requests', { identifier: value });
      setIdentifier('');
      show(res.data.status === 'accepted' ? 'You are now friends!' : 'Friend request sent', 'success');
      if (res.data.status === 'accepted') loadFriends();
      else loadRequests();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not send friend request');
      if (err.response?.status === 404) setNoAccountFound(true);
    }
  }

  async function handleAccept(id: number) {
    await client.post(`/friends/requests/${id}/accept`);
    loadFriends();
    loadRequests();
    show('Friend request accepted', 'success');
  }

  async function handleReject(id: number) {
    await client.post(`/friends/requests/${id}/reject`);
    loadRequests();
  }

  async function handleRemove(id: number, label: string) {
    if (!confirm(`Remove ${label} from your friends?`)) return;
    await client.delete(`/friends/${id}`);
    loadFriends();
    show('Friend removed');
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="font-display text-2xl text-[var(--ink)]">Friends</h1>

        <Card className="p-5">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email or username"
              className="flex-1 border-2 border-[var(--ink)] rounded-full px-4 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
            />
            <Button type="submit" variant="primary">
              Add friend
            </Button>
          </form>
          {error && <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>}
          {noAccountFound && (
            <div className="mt-3 pt-3 border-t-2 border-[var(--line)]">
              <p className="text-sm text-[var(--graphite)] mb-2">
                No account found — share your invite link with them instead:
              </p>
              <InviteLinkButton
                label="Get invite link"
                fetchLink={async () => (await client.get('/invites/friend-link')).data.url}
                className="text-sm bg-[var(--ink)] text-[var(--paper)] rounded-full px-4 py-2 border-2 border-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
              />
            </div>
          )}
        </Card>

        {incoming.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-sm text-[var(--ink)] mb-3">Friend requests</h2>
            <div className="space-y-2">
              {incoming.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--ink)]">{r.username || r.email}</span>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="primary" onClick={() => handleAccept(r.id)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleReject(r.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {outgoing.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-sm text-[var(--ink)] mb-3">Sent — waiting on them</h2>
            <div className="flex flex-wrap gap-2">
              {outgoing.map((r) => (
                <span
                  key={r.id}
                  className="text-xs border-2 border-dashed border-[var(--line)] rounded-full px-3 py-1 text-[var(--graphite)]"
                >
                  {r.username || r.email}
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-semibold text-sm text-[var(--ink)] mb-3">
            {friends.length} friend{friends.length === 1 ? '' : 's'}
          </h2>
          {loading && <p className="text-sm text-[var(--graphite)]">Loading...</p>}
          {!loading && friends.length === 0 && (
            <p className="text-sm text-[var(--graphite)]">No friends yet — add one above.</p>
          )}
          <div className="space-y-2">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{f.username || f.email}</p>
                  <p className="text-xs text-[var(--graphite)]">
                    {f.sharedPacts} shared pact{f.sharedPacts === 1 ? '' : 's'}
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => handleRemove(f.id, f.username || f.email)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
