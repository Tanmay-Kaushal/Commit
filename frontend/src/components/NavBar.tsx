import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="border-b border-stone-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/dashboard" className="font-semibold text-stone-900">
          Commit
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-500">{user.email}</span>
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
  );
}
