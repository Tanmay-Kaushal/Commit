import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Best-effort guess at the user's timezone from the browser; they can't
// change it later in this version, which is fine for a first pass.
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await signup(email, password, detectedTimezone);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Commit</h1>
        <p className="text-stone-500 text-sm mb-6">Create your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            required
            minLength={6}
          />
          <p className="text-xs text-stone-400">
            Timezone detected as {detectedTimezone}
          </p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-stone-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-stone-700 transition"
          >
            Sign up
          </button>
        </form>

        <p className="text-sm text-stone-500 mt-4 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-stone-900 font-medium underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
