import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserNotifications, type PactInviteEvent } from '../api/socket';
import PactInvitePopup from './PactInvitePopup';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [inviteQueue, setInviteQueue] = useState<PactInviteEvent[]>([]);

  useUserNotifications(user?.id, {
    onPactInvite: (invite) => setInviteQueue((q) => [...q, invite]),
  });

  function dismissInvite() {
    setInviteQueue((q) => q.slice(1));
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      <div className="border-b border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-semibold text-stone-900">
            Commit
          </Link>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <Link to="/profile" className="text-stone-500 hover:text-stone-900 underline">
                {user.username || user.email}
              </Link>
              <button
                onClick={handleLogout}
                className="text-stone-500 hover:text-stone-900 underline"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {inviteQueue.length > 0 && (
        <PactInvitePopup invite={inviteQueue[0]} onDone={dismissInvite} />
      )}
    </>
  );
}
