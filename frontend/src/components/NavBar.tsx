import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  useUserNotifications,
  type PactInviteEvent,
  type FriendRequestEvent,
  type PactCompletedEvent,
} from '../api/socket';
import PactInvitePopup from './PactInvitePopup';
import FriendRequestPopup from './FriendRequestPopup';
import PactCompletedPopup from './PactCompletedPopup';

type QueueItem =
  | { kind: 'pact_invite'; data: PactInviteEvent }
  | { kind: 'friend_request'; data: FriendRequestEvent }
  | { kind: 'pact_completed'; data: PactCompletedEvent };

export default function NavBar() {
  const { user, logout } = useAuth();
  const { dark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useUserNotifications(user?.id, {
    onPactInvite: (invite) => setQueue((q) => [...q, { kind: 'pact_invite', data: invite }]),
    onFriendRequest: (request) => setQueue((q) => [...q, { kind: 'friend_request', data: request }]),
    onPactCompleted: (data) => setQueue((q) => [...q, { kind: 'pact_completed', data }]),
  });

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
      {current?.kind === 'pact_completed' && <PactCompletedPopup event={current.data} onDone={dismiss} />}
    </>
  );
}
