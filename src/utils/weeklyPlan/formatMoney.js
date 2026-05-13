// Monetary formatting utilities for WeeklyDinnerPlanScreen
// All inputs are in cents (integer).

/**
 * Formats cents to a dollar string with two decimal places.
 * Example: 19369 -> "$193.69"
 */
export function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

/**
 * Formats cents to a compact dollar string, trimming trailing ".00".
 * Example: 2000 -> "$20", 2050 -> "$20.50"
 */
export function formatCentsCompact(cents) {
  const dollars = cents / 100;
  if (dollars === Math.floor(dollars)) {
    return '$' + Math.floor(dollars).toString();
  }
  const formatted = dollars.toFixed(2);
  // Trim trailing zero in cents (e.g. $20.50 stays $20.50, $20.00 -> $20)
  if (formatted.endsWith('0') && !formatted.endsWith('00')) {
    return '$' + formatted.slice(0, -1);
  }
  if (formatted.endsWith('.00')) {
    return '$' + formatted.slice(0, -3);
  }
  return '$' + formatted;
}
