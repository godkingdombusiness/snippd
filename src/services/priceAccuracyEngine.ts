/**
 * priceAccuracyEngine.ts
 *
 * Validates and corrects parsed deal prices BEFORE they are written to
 * stack_candidates. Runs after Gemini/flyerParser enrichment.
 *
 * Wire into offerNormalizer.ts before the INSERT:
 *
 *   const { validated, corrections } = await validateAndCorrectPrices(
 *     stagedDeals, retailerKey, supabase
 *   );
 *   if (corrections.length > 0) {
 *     await supabase.from('ingestion_run_log').insert({ ... });
 *   }
 *   // use `validated` instead of `stagedDeals` for upsert
 *
 * Run standalone:
 *   npx ts-node --project tsconfig.test.json src/services/priceAccuracyEngine.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedDeal {
  id: string;
  product_name: string;
  brand: string | null;
  sale_price: number | null;
  regular_price: number | null;
  savings_amount: number | null;
  deal_type: string;
  is_bogo: boolean;
  raw_text: string | null;
  category: string | null;
  normalized_key?: string | null;
  needs_review?: boolean;
}

export interface PriceValidationResult {
  validated: ParsedDeal[];
  corrections: string[];
  flagged_count: number;   // items marked needs_review = true
  corrected_count: number; // items with math fixes applied
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Matches "42% off", "Save 20%", "15% savings", etc.
const PCT_CLAIM_RE = /(\d{1,3})\s*%\s*(?:off|savings?|save)/i;

// Grocery items outside this range get flagged for manual review
const IMPLAUSIBLE_LOW_DOLLARS  = 0.25;
const IMPLAUSIBLE_HIGH_DOLLARS = 200;

// Historical price deviation threshold (50% = flag for review, still insert)
const HISTORICAL_DEVIATION_THRESHOLD = 0.50;

// ─── Main export ───────────────────────────────────────────────────────────

export async function validateAndCorrectPrices(
  stagedDeals: ParsedDeal[],
  retailerKey: string,
  sb?: SupabaseClient,
): Promise<PriceValidationResult> {
  const corrections: string[] = [];
  let flaggedCount   = 0;
  let correctedCount = 0;

  // Load historical avg prices for this retailer (best-effort, don't block)
  const histMap = new Map<string, number>(); // normalized_key → avg dollars

  if (sb) {
    try {
      const keys = stagedDeals
        .filter(d => d.normalized_key)
        .map(d => d.normalized_key as string)
        .slice(0, 50); // keep IN clause manageable

      if (keys.length > 0) {
        const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const { data: hist } = await sb
          .from('stack_candidates')
          .select('normalized_key, base_price')
          .in('normalized_key', keys)
          .eq('retailer_key', retailerKey)
          .gte('created_at', cutoff);

        // Build a running average per normalized_key
        const sums   = new Map<string, number>();
        const counts = new Map<string, number>();

        for (const row of hist ?? []) {
          const key = row.normalized_key as string;
          const price = Number(row.base_price) || 0;
          if (price > 0) {
            sums.set(key, (sums.get(key) ?? 0) + price);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }

        for (const [key, sum] of sums) {
          histMap.set(key, sum / (counts.get(key) ?? 1));
        }
      }
    } catch {
      // Historical check is best-effort — never block ingestion pipeline
    }
  }

  const validated: ParsedDeal[] = stagedDeals.map(deal => {
    const d: ParsedDeal = { ...deal, needs_review: deal.needs_review ?? false };
    const name = d.product_name;

    // ── 1. Inverted prices ─────────────────────────────────────────────────
    if (d.sale_price != null && d.regular_price != null &&
        d.regular_price > 0 && d.sale_price > d.regular_price) {
      corrections.push(
        `Corrected inverted prices on "${name}": ` +
        `swapped sale $${d.sale_price.toFixed(2)} ↔ regular $${d.regular_price.toFixed(2)}`,
      );
      const orig = d.sale_price;
      d.sale_price    = d.regular_price;
      d.regular_price = orig;
      correctedCount++;
    }

    // ── 2. BOGO math ───────────────────────────────────────────────────────
    if (d.is_bogo || d.deal_type?.toUpperCase() === 'BOGO') {
      if (d.regular_price != null && d.sale_price !== d.regular_price) {
        corrections.push(
          `Fixed BOGO math on "${name}": ` +
          `sale_price set to regular_price ($${d.regular_price?.toFixed(2)})`,
        );
        d.sale_price    = d.regular_price;
        d.savings_amount = d.regular_price; // free item value
        correctedCount++;
      }
    }

    // ── 3. Percentage claim validation ────────────────────────────────────
    if (d.raw_text) {
      const match = PCT_CLAIM_RE.exec(d.raw_text);
      if (match) {
        const claimedPct = parseInt(match[1], 10);
        if (d.sale_price != null && d.regular_price != null && d.regular_price > 0) {
          const actualPct = Math.round(
            ((d.regular_price - d.sale_price) / d.regular_price) * 100,
          );
          if (Math.abs(claimedPct - actualPct) > 5) {
            // Trust the prices over the marketing claim — no price change needed
            corrections.push(
              `Percentage claim "${claimedPct}% off" on "${name}" ` +
              `didn't match prices (actual: ${actualPct}%) — using prices`,
            );
          }
        }
      }
    }

    // ── 4. Implausible price check ─────────────────────────────────────────
    const checkPrice = d.sale_price ?? d.regular_price;
    if (checkPrice != null && checkPrice > 0) {
      if (checkPrice < IMPLAUSIBLE_LOW_DOLLARS) {
        corrections.push(
          `Flagged "${name}": implausibly low price $${checkPrice.toFixed(2)} — needs review`,
        );
        d.needs_review = true;
        flaggedCount++;
      } else if (checkPrice > IMPLAUSIBLE_HIGH_DOLLARS) {
        corrections.push(
          `Flagged "${name}": implausibly high price $${checkPrice.toFixed(2)} — needs review`,
        );
        d.needs_review = true;
        flaggedCount++;
      }
    }

    // ── 5. Historical deviation check ─────────────────────────────────────
    if (d.normalized_key) {
      const histAvg      = histMap.get(d.normalized_key);
      const currentPrice = checkPrice;
      if (histAvg && histAvg > 0 && currentPrice != null) {
        const ratio = Math.abs(currentPrice - histAvg) / histAvg;
        if (ratio > HISTORICAL_DEVIATION_THRESHOLD) {
          corrections.push(
            `Price deviation on "${name}": ` +
            `historical avg $${histAvg.toFixed(2)}, now $${currentPrice.toFixed(2)} ` +
            `(${Math.round(ratio * 100)}% delta) — flagged for review`,
          );
          d.needs_review = true;
          flaggedCount++;
        }
      }
    }

    return d;
  });

  return { validated, corrections, flagged_count: flaggedCount, corrected_count: correctedCount };
}

// ─── CLI entry point ───────────────────────────────────────────────────────

if (require.main === module) {
  const sample: ParsedDeal[] = [
    {
      id: 'test-1',
      product_name: 'Chicken Breast 2lb',
      brand: 'Perdue',
      sale_price: 12.99,
      regular_price: 5.99,  // inverted — will be swapped
      savings_amount: null,
      deal_type: 'SALE',
      is_bogo: false,
      raw_text: '50% off chicken breast',
      category: 'meat',
      normalized_key: 'perdue_chicken_breast_2lb',
    },
    {
      id: 'test-2',
      product_name: 'Paper Towels 6pk',
      brand: 'Bounty',
      sale_price: 0.10,    // implausibly low
      regular_price: 8.99,
      savings_amount: 8.89,
      deal_type: 'SALE',
      is_bogo: false,
      raw_text: null,
      category: 'household',
      normalized_key: 'bounty_paper_towels_6pk',
    },
    {
      id: 'test-3',
      product_name: 'Greek Yogurt 32oz',
      brand: 'Chobani',
      sale_price: 5.99,
      regular_price: 5.99,  // BOGO — sale should equal regular
      savings_amount: null,
      deal_type: 'BOGO',
      is_bogo: true,
      raw_text: 'Buy 1 Get 1 Free',
      category: 'dairy',
      normalized_key: 'chobani_greek_yogurt_32oz',
    },
  ];

  validateAndCorrectPrices(sample, 'test_retailer')
    .then(({ validated, corrections, flagged_count, corrected_count }) => {
      console.log('PriceAccuracyEngine test run');
      console.log(`  Deals processed: ${validated.length}`);
      console.log(`  Corrections:     ${corrected_count}`);
      console.log(`  Flagged:         ${flagged_count}`);
      console.log('\nCorrections:');
      corrections.forEach(c => console.log(`  • ${c}`));
    })
    .catch(console.error);
}
