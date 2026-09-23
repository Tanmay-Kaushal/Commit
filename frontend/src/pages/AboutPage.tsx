import NavBar from '../components/NavBar';
import Card from '../components/ui/Card';

const STEPS = [
  { n: 1, title: 'Commit', body: 'Pick a habit, a date range, chosen days of the week, and a stake per missed day.' },
  { n: 2, title: 'Check in', body: 'On each scheduled day, hit check-in. Everyone can see who has and hasn\'t, live.' },
  { n: 3, title: 'Settle up', body: "Miss a day and your stake splits among everyone who didn't. No cheating — a partner is watching." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="font-display text-3xl text-[var(--ink)] mb-2">About Commit</h1>
          <p className="text-sm text-[var(--graphite)]">
            A habit accountability app for two (or more) people. You commit to a habit with a stake attached — miss
            a day, and your stake splits among the partners who didn't.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STEPS.map((s) => (
            <Card key={s.n} className="p-5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-[var(--ink)] bg-[var(--accent)] font-display text-sm mb-3">
                {s.n}
              </span>
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">{s.title}</p>
              <p className="text-xs text-[var(--graphite)]">{s.body}</p>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <p className="text-sm text-[var(--ink)]">
            Built as a personal project. Every scheduled day is settled automatically by a background job, and
            everything — check-ins, disputes, settlements — is logged in each pact's history.
          </p>
          <p className="text-xs text-[var(--graphite)] mt-3">Version 1.3</p>
        </Card>
      </div>
    </div>
  );
}
