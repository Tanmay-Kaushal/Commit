import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import NavBar from '../components/NavBar';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: string;
};

// SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS" (space-separated,
// UTC, no timezone marker) — not valid ISO 8601 as-is, so normalize it.
function parseServerDate(raw: string) {
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
}

function dayLabel(iso: string) {
  const date = parseServerDate(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await client.get('/notifications');
      setNotifications(res.data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen(n: Notification) {
    if (!n.read) {
      client.post(`/notifications/${n.id}/read`).catch(() => {});
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.url) navigate(n.url);
  }

  async function handleReadAll() {
    await client.post('/notifications/read-all');
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
  }

  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of notifications) {
    const label = dayLabel(n.createdAt);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(n);
    else groups.push({ label, items: [n] });
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl text-[var(--ink)]">Notifications</h1>
          {hasUnread && (
            <Button size="sm" variant="secondary" onClick={handleReadAll}>
              Mark all read
            </Button>
          )}
        </div>

        {loading && <p className="text-sm text-[var(--graphite)]">Loading...</p>}
        {!loading && notifications.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-[var(--graphite)]">Nothing here yet.</p>
          </Card>
        )}

        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--graphite)] mb-2">{g.label}</h2>
              <div className="space-y-2">
                {g.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleOpen(n)}
                    className="w-full text-left"
                  >
                    <Card className={`p-4 flex items-start gap-3 transition-transform hover:-translate-y-0.5 ${n.read ? 'opacity-70' : ''}`}>
                      {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" aria-label="Unread" />}
                      {n.read && <span className="w-2.5 h-2.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink)] truncate">{n.title}</p>
                        <p className="text-sm text-[var(--graphite)] mt-0.5">{n.body}</p>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
