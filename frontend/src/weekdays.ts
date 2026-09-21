// Mirrors backend/src/weekdays.js: a 7-bit mask, bit (isoWeekday-1) set
// means that weekday is scheduled. ISO weekday 1=Monday..7=Sunday.
export const ALL_DAYS_MASK = 0b1111111;

export const WEEKDAY_LABELS: { iso: number; short: string; full: string }[] = [
  { iso: 1, short: 'M', full: 'Monday' },
  { iso: 2, short: 'T', full: 'Tuesday' },
  { iso: 3, short: 'W', full: 'Wednesday' },
  { iso: 4, short: 'T', full: 'Thursday' },
  { iso: 5, short: 'F', full: 'Friday' },
  { iso: 6, short: 'S', full: 'Saturday' },
  { iso: 7, short: 'S', full: 'Sunday' },
];

export function isDayScheduled(mask: number, isoWeekday: number) {
  return (mask & (1 << (isoWeekday - 1))) !== 0;
}

export function maskFromDays(days: number[]) {
  return days.reduce((mask, iso) => mask | (1 << (iso - 1)), 0);
}

export function maskToDays(mask: number) {
  return WEEKDAY_LABELS.filter((d) => isDayScheduled(mask, d.iso)).map((d) => d.iso);
}

// Short human summary like "Everyday" / "Weekdays" / "Mon, Wed, Fri".
export function describeMask(mask: number) {
  if (mask === ALL_DAYS_MASK) return 'Everyday';
  if (mask === 0b0011111) return 'Weekdays';
  if (mask === 0b1100000) return 'Weekends';
  const days = WEEKDAY_LABELS.filter((d) => isDayScheduled(mask, d.iso));
  return days.map((d) => d.full.slice(0, 3)).join(', ');
}
