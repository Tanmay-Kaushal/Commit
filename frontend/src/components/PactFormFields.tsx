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

const inputClass = 'w-full border-2 border-[var(--ink)] rounded-xl px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]';
const labelClass = 'text-sm text-[var(--graphite)] block mb-1';

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
        <label className={labelClass}>Habit</label>
        <input
          value={habitDescription}
          onChange={(e) => set({ habitDescription: e.target.value })}
          placeholder="e.g. Run"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-sm text-[var(--graphite)] block mb-2">Which days?</label>
        <div className="flex gap-1.5 mb-2">
          {WEEKDAY_LABELS.map((d) => (
            <button
              key={d.iso}
              type="button"
              title={d.full}
              onClick={() => toggleWeekday(d.iso)}
              className={`w-9 h-9 rounded-full text-sm font-semibold border-2 border-[var(--ink)] transition-colors ${
                selectedDays.includes(d.iso)
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--line)]'
              }`}
            >
              {d.short}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--graphite)]">
          <input type="checkbox" checked={selectedDays.length === 7} onChange={toggleEveryday} />
          Everyday
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>From</label>
          <input
            type="date"
            value={startDate}
            min={todayISO()}
            onChange={(e) => set({ startDate: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>To</label>
          <input
            type="date"
            value={endDate}
            min={startDate || todayISO()}
            onChange={(e) => set({ endDate: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Stake per missed day</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 100"
          value={stakeAmount}
          onChange={handleStakeChange}
          className={inputClass}
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
