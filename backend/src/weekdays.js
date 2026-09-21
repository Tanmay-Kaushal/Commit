// 7-bit mask; bit (isoWeekday-1) set = scheduled. Matches luxon's
// DateTime#weekday (1=Monday..7=Sunday).
const ALL_DAYS_MASK = 0b1111111;

function isDayScheduled(mask, isoWeekday) {
  return (mask & (1 << (isoWeekday - 1))) !== 0;
}

// days: array of ISO weekday numbers, 1 (Monday) through 7 (Sunday).
function maskFromDays(days) {
  let mask = 0;
  for (const d of days || []) {
    const iso = Number(d);
    if (Number.isInteger(iso) && iso >= 1 && iso <= 7) mask |= (1 << (iso - 1));
  }
  return mask;
}

function maskToDays(mask) {
  const days = [];
  for (let iso = 1; iso <= 7; iso++) {
    if (isDayScheduled(mask, iso)) days.push(iso);
  }
  return days;
}

module.exports = { ALL_DAYS_MASK, isDayScheduled, maskFromDays, maskToDays };
