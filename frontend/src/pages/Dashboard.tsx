import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';

type Pact = {
  id: number;
  creator_id: number;
  partner_id: number | null;
  partner_email: string;
  habit_description: string;
  frequency_per_week: number;
  stake_amount: number;
  cycle_length_days: number;
  status: string;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // form state
  const [habitDescription, setHabitDescription] = useState('');
  const [frequencyPerWeek, setFrequencyPerWeek] = useState(3);
  const [stakeAmount, setStakeAmount] = useState(100);
  const [cycleLengthDays, setCycleLengthDays] = useState(7);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [error, setError] = useState('');

  async function loadPacts() {
    setLoading(true);
    const res = await client.get('/pacts');
    setPacts(res.data);
    setLoading(false);
  }

  useEffect(() => {
    loadPacts();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/pacts', {
        habitDescription,
        frequencyPerWeek,
        stakeAmount,
        cycleLengthDays,
        partnerEmail,
      });
      setShowForm(false);
      setHabitDescription('');
      setPartnerEmail('');
      loadPacts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not create pact');
    }
  }

  async function handleAccept(pactId: number) {
    await client.post(`/pacts/${pactId}/accept`);
    loadPacts();
  }

  function statusBadge(pact: Pact) {
    if (pact.status === 'pending_invite') {
      if (pact.partner_email === user?.email) {
        return <span className="text-amber-600 text-xs font-medium">Invite pending — join?</span>;
      }
      return <span className="text-stone-400 text-xs">Waiting on {pact.partner_email}</span>;
    }
    return <span className="text-emerald-600 text-xs font-medium">Active</span>;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-stone-900">Your pacts</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition"
          >
            {showForm ? 'Cancel' : 'New pact'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white border border-stone-200 rounded-xl p-6 mb-6 space-y-4"
          >
            <div>
              <label className="text-sm text-stone-600 block mb-1">Habit</label>
              <input
                value={habitDescription}
                onChange={(e) => setHabitDescription(e.target.value)}
                placeholder="e.g. Run 3x a week"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-stone-600 block mb-1">Times per week</label>
                <input
                  type="number"
                  min={1}
                  value={frequencyPerWeek}
                  onChange={(e) => setFrequencyPerWeek(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-stone-600 block mb-1">Cycle length (days)</label>
                <input
                  type="number"
                  min={1}
                  value={cycleLengthDays}
                  onChange={(e) => setCycleLengthDays(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-stone-600 block mb-1">Stake amount</label>
              <input
                type="number"
                min={0}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(Number(e.target.value))}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600 block mb-1">Partner's email</label>
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="partner@example.com"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              className="bg-stone-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 transition"
            >
              Create pact
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : pacts.length === 0 ? (
          <p className="text-stone-400 text-sm">No pacts yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {pacts.map((pact) => (
              <div
                key={pact.id}
                className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-stone-900">{pact.habit_description}</p>
                  <p className="text-sm text-stone-500">
                    {pact.frequency_per_week}x/week &middot; stake {pact.stake_amount} &middot;{' '}
                    {statusBadge(pact)}
                  </p>
                </div>
                {pact.status === 'pending_invite' && pact.partner_email === user?.email ? (
                  <button
                    onClick={() => handleAccept(pact.id)}
                    className="bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition"
                  >
                    Accept
                  </button>
                ) : (
                  <Link
                    to={`/pacts/${pact.id}`}
                    className="text-stone-900 text-sm font-medium underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
