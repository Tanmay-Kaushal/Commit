import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { DebtReminderEvent } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../lib/format';
import Card from './ui/Card';
import Button from './ui/Button';

// Daily "you still owe this" nag — shown once per calendar day per unpaid debt.
export default function DebtReminderPopup({
  debt,
  onDone,
}: {
  debt: DebtReminderEvent;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    client.post(`/debts/${debt.settlementId}/ack-reminder`).catch(() => {});
  }, [debt.settlementId]);

  function goToPact() {
    onDone();
    navigate(`/pacts/${debt.pactId}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">You still owe this</p>
        <h2 className="font-display text-lg text-[var(--ink)] mb-3">
          {formatMoney(debt.amount, user?.currency)} for missing "{debt.habitDescription}"
        </h2>
        <p className="text-sm text-[var(--graphite)] mb-4">
          Missed on {debt.scheduledDate}. This'll keep popping up daily until it's marked paid — from either side.
        </p>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={goToPact}>
            Go pay it
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onDone}>
            Later today
          </Button>
        </div>
      </Card>
    </div>
  );
}
