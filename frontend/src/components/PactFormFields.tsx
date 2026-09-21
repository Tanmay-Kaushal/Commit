import { WEEKDAY_LABELS } from '../weekdays';

// Local calendar date, not UTC (must agree with the backend's local-timezone check).
function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type PactFormValues = {
  habitDescription: string;
  stakeAmount: string;
  selectedDays: number[];
  startDate: string;
  endDate: string;
};

export default function PactFormFields({
  values,
  onChange,
}: {
  values: PactFormValues;
  onChange: (values: PactFormValues) => void;
}) {
  const { habitDescription, stakeAmount, selectedDays, startDate, endDate } = values;

  function set(patch: Partial<PactFormValues>) {
    onChange({ ...values, ...patch });
  }

  function toggleWeekday(iso: number) {
    set({ selectedDays: selectedDays.includes(iso) ? selectedDays.filter((d) => d !== iso) : [...selectedDays, iso] });
  }

  function toggleEveryday() {
    set({ selectedDays: selectedDays.length === 7 ? [] : WEEKDAY_LABELS.map((d) => d.iso) });
  }

  function handleStakeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val === '' || /^[0-9]+$/.test(val)) set({ stakeAmount: val });
  }

  return (
    <>
      <div>
        <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Habit</label>
        <input
          value={habitDescription}
          onChange={(e) => set({ habitDescription: e.target.value })}
          placeholder="e.g. Run"
          className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm text-stone-600 dark:text-stone-400 block mb-2">Which days?</label>
        <div className="flex gap-1.5 mb-2">
          {WEEKDAY_LABELS.map((d) => (
            <button
              key={d.iso}
              type="button"
              title={d.full}
              onClick={() => toggleWeekday(d.iso)}
              className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                selectedDays.includes(d.iso)
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
              }`}
            >
              {d.short}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
          <input type="checkbox" checked={selectedDays.length === 7} onChange={toggleEveryday} />
          Everyday
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            min={todayISO()}
            onChange={(e) => set({ startDate: e.target.value })}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            min={startDate || todayISO()}
            onChange={(e) => set({ endDate: e.target.value })}
            className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-stone-600 dark:text-stone-400 block mb-1">Stake per missed day</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 100"
          value={stakeAmount}
          onChange={handleStakeChange}
          className="w-full border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}

export function isPactFormValid(values: PactFormValues) {
  return (
    values.habitDescription.trim() !== '' &&
    values.stakeAmount.trim() !== '' &&
    values.selectedDays.length > 0 &&
    values.startDate !== '' &&
    values.endDate !== '' &&
    values.endDate >= values.startDate
  );
}
