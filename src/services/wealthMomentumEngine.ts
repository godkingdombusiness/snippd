/**
 * wealthMomentumEngine.ts
 *
 * Pure math service for the Wealth Momentum Engine.
 * Converts grocery savings into projected investment value —
 * shifting the user's mental model from "groceries" to "generational wealth."
 *
 * Core idea: Every dollar not spent on groceries is a dollar that
 * could compound in an index fund. We surface that number to make
 * saving feel meaningful beyond the receipt.
 *
 * No DB access — pure computation. Safe to call anywhere.
 *
 * Usage:
 *   const ticker = buildMomentumTicker(savingsCents);
 *   // "This week's $47.20 savings, invested in S&P 500, becomes $317 in 20 years"
 *
 *   const data = projectSavingsGrowth(savingsCents, [5, 10, 20]);
 *   // [{ years: 5, futureCents: 76000 }, ...]
 */

// ── Constants ─────────────────────────────────────────────────

// S&P 500 annualized average return (1957–2024, inflation-adjusted ~7%, nominal ~10%)
const SP500_ANNUAL_RATE = 0.10;

// Weeks per year (used to annualize weekly contributions)
const WEEKS_PER_YEAR = 52;

// ── Types ─────────────────────────────────────────────────────

export interface GrowthProjection {
  years:        number;
  futureCents:  number;
  futureLabel:  string;   // "$1,400"
  multiplier:   number;   // 28× for example
}

export interface MomentumTicker {
  savingsCents:    number;
  savingsLabel:    string;   // "$47.20"
  projection20y:   GrowthProjection;
  projection10y:   GrowthProjection;
  projection5y:    GrowthProjection;
  annualizedCents: number;   // if user saves same amount every week for a year
  tagline:         string;   // the "compelling hook" copy
}

// ── Core math ─────────────────────────────────────────────────

/**
 * Future Value of a single lump sum invested today.
 * FV = PV × (1 + r)^n
 */
export function futureValueLump(presentValueCents: number, annualRate: number, years: number): number {
  return Math.round(presentValueCents * Math.pow(1 + annualRate, years));
}

/**
 * Future Value of an annuity — weekly contributions, compounded weekly.
 * FV = PMT × [ ((1 + r/52)^(52n) - 1) / (r/52) ]
 */
export function futureValueAnnuity(
  weeklyContributionCents: number,
  annualRate: number,
  years: number,
): number {
  const weeklyRate  = annualRate / WEEKS_PER_YEAR;
  const numWeeks    = years * WEEKS_PER_YEAR;
  const fv = weeklyContributionCents * ((Math.pow(1 + weeklyRate, numWeeks) - 1) / weeklyRate);
  return Math.round(fv);
}

/**
 * Format cents to a compact display label.
 * 150000 → "$1,500"
 * 1500000 → "$15K"
 * 15000000 → "$150K"
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 100_000)   return `$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 10_000)    return `$${(dollars / 1_000).toFixed(1)}K`;
  return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Projection builder ────────────────────────────────────────

function buildProjection(
  savingsCents:  number,
  years:         number,
): GrowthProjection {
  // Model: user saves this amount every week for N years
  const futureCents = futureValueAnnuity(savingsCents, SP500_ANNUAL_RATE, years);
  const multiplier  = savingsCents > 0 ? Math.round(futureCents / savingsCents) : 0;
  return {
    years,
    futureCents,
    futureLabel: formatCents(futureCents),
    multiplier,
  };
}

// ── Main export ───────────────────────────────────────────────

/**
 * Builds the full Wealth Momentum Ticker object for a given
 * weekly savings amount in cents.
 *
 * @param savingsCents — this week's verified savings (e.g. 4720 = $47.20)
 */
export function buildMomentumTicker(savingsCents: number): MomentumTicker {
  const savingsLabel = '$' + (savingsCents / 100).toFixed(2);

  const projection5y  = buildProjection(savingsCents, 5);
  const projection10y = buildProjection(savingsCents, 10);
  const projection20y = buildProjection(savingsCents, 20);

  const annualizedCents = savingsCents * WEEKS_PER_YEAR;

  // Pick the most compelling horizon for the tagline
  // Show 10y if the 20y number is overwhelming, 20y otherwise
  const taglineProjection = projection20y.futureCents > 500_000_00
    ? projection10y
    : projection20y;

  const tagline =
    `This week's ${savingsLabel} savings, invested in an S&P 500 index fund, ` +
    `becomes ${taglineProjection.futureLabel} in ${taglineProjection.years} years.`;

  return {
    savingsCents,
    savingsLabel,
    projection5y,
    projection10y,
    projection20y,
    annualizedCents,
    tagline,
  };
}

/**
 * Returns projections for multiple time horizons at once.
 */
export function projectSavingsGrowth(
  savingsCents: number,
  horizons: number[] = [5, 10, 20],
): GrowthProjection[] {
  return horizons.map(y => buildProjection(savingsCents, y));
}
