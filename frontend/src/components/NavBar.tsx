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

  useUserNotifications(user?.id, {
    onPactInvite: (invite) => setQueue((q) => [...q, { kind: 'pact_invite', data: invite }]),
    onFriendRequest: (request) => setQueue((q) => [...q, { kind: 'friend_request', data: request }]),
    onPactDayCompleted: (data) => setQueue((q) => [...q, { kind: 'pact_day_completed', data }]),
    onDebtReminder: (data) => setQueue((q) => [...q, { kind: 'debt_reminder', data }]),
    onPaymentReceived: (data) => setQueue((q) => [...q, { kind: 'payment_received', data }]),
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

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const current = queue[0];

  return (
    <>
      <div className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-semibold text-stone-900 dark:text-stone-100">
            Commit
          </Link>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={toggleDark}
                aria-label="Toggle dark mode"
                className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline"
              >
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
              <Link
                to="/profile"
                className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline"
              >
                {user.username || user.email}
              </Link>
              <button
                onClick={handleLogout}
                className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {current?.kind === 'pact_invite' && <PactInvitePopup invite={current.data} onDone={dismiss} />}
      {current?.kind === 'friend_request' && <FriendRequestPopup request={current.data} onDone={dismiss} />}
      {current?.kind === 'pact_day_completed' && <PactCompletedPopup event={current.data} onDone={dismiss} />}
      {current?.kind === 'debt_reminder' && <DebtReminderPopup debt={current.data} onDone={dismiss} />}
      {current?.kind === 'payment_received' && <PaymentReceivedPopup event={current.data} onDone={dismiss} />}
    </>
  );
}
