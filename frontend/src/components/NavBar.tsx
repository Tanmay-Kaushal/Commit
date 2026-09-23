import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import client from '../api/client';
import {
  useUserNotifications,
  type PactInviteEvent,
  type FriendRequestEvent,
  type PactDayCompletedEvent,
  type DebtReminderEvent,
  type PaymentReceivedEvent,
} from '../api/socket';
import PactInvitePopup from './PactInvitePopup';
import FriendRequestPopup from './FriendRequestPopup';
import PactCompletedPopup from './PactCompletedPopup';
import DebtReminderPopup from './DebtReminderPopup';
import PaymentReceivedPopup from './PaymentReceivedPopup';
import Sheet from './ui/Sheet';
import MenuItem from './ui/MenuItem';

type QueueItem =
  | { kind: 'pact_invite'; data: PactInviteEvent }
  | { kind: 'friend_request'; data: FriendRequestEvent }
  | { kind: 'pact_day_completed'; data: PactDayCompletedEvent }
  | { kind: 'debt_reminder'; data: DebtReminderEvent }
  | { kind: 'payment_received'; data: PaymentReceivedEvent };

export default function NavBar() {
  const { user, logout } = useAuth();
  const { dark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function refreshUnreadCount() {
    client
      .get('/notifications/unread-count')
      .then((res) => setUnreadCount(res.data.count))
      .catch(() => {});
  }

  useEffect(() => {
    if (!user?.id) return;
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useUserNotifications(user?.id, {
    onPactInvite: (invite) => {
      setQueue((q) => [...q, { kind: 'pact_invite', data: invite }]);
      refreshUnreadCount();
    },
    onFriendRequest: (request) => {
      setQueue((q) => [...q, { kind: 'friend_request', data: request }]);
      refreshUnreadCount();
    },
    onPactDayCompleted: (data) => {
      setQueue((q) => [...q, { kind: 'pact_day_completed', data }]);
      refreshUnreadCount();
    },
    onDebtReminder: (data) => {
      setQueue((q) => [...q, { kind: 'debt_reminder', data }]);
      refreshUnreadCount();
    },
    onPaymentReceived: (data) => {
      setQueue((q) => [...q, { kind: 'payment_received', data }]);
      refreshUnreadCount();
    },
  });

  // Catch up on any debt reminder still due, in case it was missed while offline.
  useEffect(() => {
    if (!user?.id) return;
    client
      .get('/debts')
      .then((res) => {
        const due = (res.data.owedByMe || []).filter((d: any) => d.shouldNagNow);
        if (due.length > 0) {
          setQueue((q) => [
            ...q,
            ...due.map((d: any) => ({
              kind: 'debt_reminder' as const,
              data: {
                settlementId: d.settlementId,
                pactId: d.pactId,
                habitDescription: d.habitDescription,
                scheduledDate: d.scheduledDate,
                amount: d.amount,
              },
            })),
          ]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  function closeMenu() {
    setMenuOpen(false);
    refreshUnreadCount();
  }

  function handleLogout() {
    closeMenu();
    logout();
    navigate('/login');
  }

  const current = queue[0];

  return (
    <>
      <div className="border-b-2 border-[var(--ink)] bg-[var(--paper)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-display text-xl text-[var(--ink)] flex items-center gap-1">
            Commit
          </Link>
          {user && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={unreadCount > 0 ? `Open menu (${unreadCount} unread)` : 'Open menu'}
              className="relative w-10 h-10 inline-flex flex-col items-center justify-center gap-[4px] rounded-full border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform"
            >
              <span className="block w-5 h-0.5 bg-[var(--ink)]" />
              <span className="block w-5 h-0.5 bg-[var(--ink)]" />
              <span className="block w-5 h-0.5 bg-[var(--ink)]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] border-2 border-[var(--ink)] text-[10px] font-bold text-[var(--ink)] flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <Sheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          refreshUnreadCount();
        }}
        title="Commit"
      >
        <MenuItem to="/dashboard" onClick={closeMenu}>
          Dashboard
        </MenuItem>
        <MenuItem to="/friends" onClick={closeMenu}>
          Friends
        </MenuItem>
        <MenuItem to="/notifications" onClick={closeMenu}>
          Notifications
        </MenuItem>
        <MenuItem to="/achievements" onClick={closeMenu}>
          Achievements &amp; Stats
        </MenuItem>
        <MenuItem to="/profile" onClick={closeMenu}>
          Profile ({user?.username || user?.email})
        </MenuItem>
        <div className="my-2 border-t-2 border-[var(--line)]" />
        <MenuItem to="/settings" onClick={closeMenu}>
          Settings
        </MenuItem>
        <MenuItem to="/help" onClick={closeMenu}>
          Help &amp; FAQ
        </MenuItem>
        <MenuItem to="/about" onClick={closeMenu}>
          About Commit
        </MenuItem>
        <div className="my-2 border-t-2 border-[var(--line)]" />
        <MenuItem onClick={toggleDark}>{dark ? 'Light mode' : 'Dark mode'}</MenuItem>
        <MenuItem onClick={handleLogout} danger>
          Log out
        </MenuItem>
      </Sheet>

      {current?.kind === 'pact_invite' && <PactInvitePopup invite={current.data} onDone={dismiss} />}
      {current?.kind === 'friend_request' && <FriendRequestPopup request={current.data} onDone={dismiss} />}
      {current?.kind === 'pact_day_completed' && <PactCompletedPopup event={current.data} onDone={dismiss} />}
      {current?.kind === 'debt_reminder' && <DebtReminderPopup debt={current.data} onDone={dismiss} />}
      {current?.kind === 'payment_received' && <PaymentReceivedPopup event={current.data} onDone={dismiss} />}
    </>
  );
}
