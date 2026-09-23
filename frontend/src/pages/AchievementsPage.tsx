import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import NavBar from '../components/NavBar';
import Card from '../components/ui/Card';
import { formatMoney } from '../lib/format';

type Stats = {
  totalCheckins: number;
  completionPct: number | null;
  currentStreak: number;
  longestStreak: number;
  moneyWon: number;
  moneyLost: number;
  moneyOutstanding: number;
  pactsCompleted: number;
  friendsCount: number;
};

type Achievement = {
  id: string;
  label: string;
  description: string;
  unlocked: boolean;
  progress: { current: number; target: number };
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-display text-[var(--ink)]">{value}</p>
      <p className="text-xs text-[var(--graphite)] mt-1">{label}</p>
    </Card>
  );
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get('/stats')
      .then((res) => {
        setStats(res.data.stats);
        setAchievements(res.data.achievements);
      })
      .finally(() => setLoading(false));
  }, []);

  const currency = user?.currency || '$';

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="font-display text-2xl text-[var(--ink)]">Achievements &amp; Stats</h1>

        {loading && <p className="text-sm text-[var(--graphite)]">Loading...</p>}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Check-ins" value={String(stats.totalCheckins)} />
            <StatCard label="Completion" value={stats.completionPct === null ? '—' : `${stats.completionPct}%`} />
            <StatCard label="Current streak" value={`${stats.currentStreak}d`} />
            <StatCard label="Best streak" value={`${stats.longestStreak}d`} />
            <StatCard label="Won" value={formatMoney(stats.moneyWon, currency)} />
            <StatCard label="Lost" value={formatMoney(stats.moneyLost, currency)} />
            <StatCard label="Outstanding" value={formatMoney(stats.moneyOutstanding, currency)} />
            <StatCard label="Pacts finished" value={String(stats.pactsCompleted)} />
          </div>
        )}

        <div>
          <h2 className="font-semibold text-sm text-[var(--ink)] mb-3">Badges</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {achievements.map((a) => (
              <Card
                key={a.id}
                className={`p-4 flex items-start gap-3 ${a.unlocked ? '' : 'opacity-50'}`}
              >
                <span
                  className={`w-10 h-10 rounded-full border-2 border-[var(--ink)] shrink-0 flex items-center justify-center font-display text-lg ${
                    a.unlocked ? 'bg-[var(--accent)] text-[var(--ink)]' : 'bg-[var(--paper)] text-[var(--graphite)]'
                  }`}
                >
                  {a.unlocked ? '✓' : '?'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink)]">{a.label}</p>
                  <p className="text-xs text-[var(--graphite)] mt-0.5">{a.description}</p>
                  {!a.unlocked && a.progress.target > 1 && (
                    <p className="text-xs text-[var(--graphite)] mt-1">
                      {a.progress.current}/{a.progress.target}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
