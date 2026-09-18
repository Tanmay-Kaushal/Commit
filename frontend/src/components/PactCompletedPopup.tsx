import type { PactCompletedEvent } from '../api/socket';

// Celebratory popup shown live when a cycle closes out with everyone
// having checked in — no stakes changed hands, so it's worth calling out.
export default function PactCompletedPopup({
  event,
  onDone,
}: {
  event: PactCompletedEvent;
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 dark:bg-black/60 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-xl shadow-lg border border-stone-200 dark:border-stone-800 p-6 text-center">
        <p className="text-3xl mb-2">🎉</p>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">Bravo!</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
          Everyone kept up their end on "{event.habitDescription}" — cycle complete, no stakes lost.
        </p>
        <button
          onClick={onDone}
          className="w-full bg-emerald-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-emerald-700 transition"
        >
          Nice
        </button>
      </div>
    </div>
  );
}
