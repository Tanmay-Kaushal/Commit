import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { DebtReminderEvent } from '../api/socket';

// Daily "you still owe this" nag — shown once per calendar day per unpaid debt.
export default function DebtReminderPopup({
  debt,
  onDone,
}: {
  debt: DebtReminderEvent;
  onDone: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    client.post(`/debts/${debt.settlementId}/ack-reminder`).catch(() => {});
  }, [debt.settlementId]);

  function goToPact() {
    onDone();
    navigate(`/pacts/${debt.pactId}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 dark:bg-black/60 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-lg border border-stone-200 dark:border-stone-800 p-6">
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
          You still owe this
        </p>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">
          {debt.amount.toFixed(2)} for missing "{debt.habitDescription}"
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Missed on {debt.scheduledDate}. This'll keep popping up daily until it's marked paid — from either side.
        </p>

        <div className="flex gap-2">
          <button
            onClick={goToPact}
            className="flex-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-700 dark:hover:bg-stone-300 transition"
          >
            Go pay it
          </button>
          <button
            onClick={onDone}
            className="flex-1 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-sm font-medium rounded-lg px-4 py-2 hover:bg-stone-300 dark:hover:bg-stone-600 transition"
          >
            Later today
          </button>
        </div>
      </div>
    </div>
  );
}
