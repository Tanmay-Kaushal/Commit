// Display-only currency formatting — no conversion, just prefixes the
// user's chosen symbol (see Settings > Preferences).
export function formatMoney(amount: number, currency: string = '$') {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency}${Math.abs(amount).toFixed(2)}`;
}
