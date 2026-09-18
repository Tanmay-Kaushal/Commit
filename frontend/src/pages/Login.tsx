import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(identifier, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-1">Commit</h1>
        <p className="text-stone-500 dark:text-stone-400 text-sm mb-6">Log in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Enter your email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100"
            required
          />
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg py-2 text-sm font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition"
          >
            Log in
          </button>
        </form>

        <p className="text-sm text-stone-500 dark:text-stone-400 mt-4 text-center">
          No account?{' '}
          <Link to="/signup" className="text-stone-900 dark:text-stone-100 font-medium underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
