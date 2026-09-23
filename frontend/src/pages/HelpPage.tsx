import { useState } from 'react';
import NavBar from '../components/NavBar';
import Card from '../components/ui/Card';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do pacts work?',
    a: "You and a partner (or a group) commit to a habit over a date range, on chosen days of the week, with a stake attached. A pact activates once its start date arrives and at least one partner has accepted. From then on, everyone can check in on scheduled days.",
  },
  {
    q: 'What happens to the stake?',
    a: "A background job checks every minute whether a scheduled day has passed. Once it has, anyone who didn't check in splits their stake among everyone who did. You'll see the debt or credit on the pact page.",
  },
  {
    q: 'How do settlements work?',
    a: 'When you owe money, it shows as a debt on the pact page and you may get periodic reminders. When you mark it paid, the person you owed confirms it, and the settlement is closed.',
  },
  {
    q: "What if I forgot to check in but actually did the habit?",
    a: "Raise a dispute from the pact page (capped at 3 attempts per day). Another participant can approve or reject it — approving restores your check-in for that day.",
  },
  {
    q: 'How do invites work?',
    a: "By email or username directly, or by sharing your personal invite link (Profile > Invite friends) or a pact's link (pact page > share). Opening a link while logged in accepts it immediately; logged out, you're sent to sign in first and land back on it after.",
  },
  {
    q: "What if someone doesn't have a Commit account yet?",
    a: "Sending them a friend request will tell you no account was found — share your invite link with them directly instead.",
  },
  {
    q: 'Can I be in more than one pact at once?',
    a: 'Yes — pacts are independent. You can have as many active pacts as you like, with different partners and different habits.',
  },
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl text-[var(--ink)] mb-6">Help &amp; FAQ</h1>
        <div className="space-y-3">
          {FAQ.map((item, i) => {
            const open = openIndex === i;
            return (
              <Card key={item.q} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-[var(--ink)]">{item.q}</span>
                  <span className="text-[var(--ink)] text-lg shrink-0">{open ? '−' : '+'}</span>
                </button>
                {open && <p className="px-5 pb-4 text-sm text-[var(--graphite)]">{item.a}</p>}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
