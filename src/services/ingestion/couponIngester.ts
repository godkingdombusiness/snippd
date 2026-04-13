/**
 * couponIngester — Ingests digital coupons and matches them to weekly offers
 *
 * ingestDigitalCoupons(retailerKey, weekOf, supabase):
 *   1. Reads active digital_coupons for retailerKey
 *   2. Generates normalized_key for each coupon
 *   3. Matches against offer_sources using coupon_match_mode from policy
 *   4. Upserts offer_matches + recalculates final_price_cents
 *   5. Updates stack_candidates stack_rank_score
 *   6. Returns match counts
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DigitalCoupon {
  id: string;
  retailer_key: string;
  product_name: string;
  brand: string | null;
  normalized_key: string;
  discount_cents: number;
  discount_pct: number | null;
  coupon_type: string;           // 'manufacturer' | 'store' | 'digital'
  expires_at: string | null;
  is_active: boolean;
}

interface OfferSource {
  id: string;
  retailer_key: string;
  week_of: string;
  normalized_key: string;
  dedupe_key: string;
  product_name: string;
  brand: string | null;
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  savings_pct?: number;
}

// ─────────────────────────────────────────────────────────────
// Matching helpers
// ─────────────────────────────────────────────────────────────

function makeNormalizedKey(brand: string | null, productName: string): string {
  return [brand, productName]
    .filter(Boolean)
    .map((s) => s!.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
    .join('_');
}

function tokenize(key: string): string[] {
  return key.split('_').filter((t) => t.length > 2);
}

function tokenOverlapCount(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  return tokenize(b).filter((t) => setA.has(t)).length;
}

function matchOffer(
  coupon: DigitalCoupon,
  offer: OfferSource,
  matchMode: string,
): boolean {
  switch (matchMode) {
    case 'exact_name':
      return coupon.normalized_key === offer.normalized_key;

    case 'brand_or_name': {
      const brandMatch = coupon.brand && offer.brand &&
        coupon.brand.toLowerCase() === offer.brand.toLowerCase();
      const nameToken = (coupon.product_name ?? '')
        .toLowerCase().replace(/\s+/g, '_').slice(0, 8);
      const nameMatch = offer.normalized_key.includes(nameToken);
      return Boolean(brandMatch) || nameMatch;
    }

    default: // token_overlap
      return tokenOverlapCount(coupon.normalized_key, offer.normalized_key) >= 2;
  }
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function ingestDigitalCoupons(
  retailerKey: string,
  weekOf: string,
  supabase: SupabaseClient,
): Promise<{ coupons_processed: number; new_matches: number; candidates_updated: number }> {
  // 1. Read active digital coupons for this retailer
  const { data: couponRows, error: couponErr } = await supabase
    .from('digital_coupons')
    .select('id, retailer_key, product_name, brand, normalized_key, discount_cents, discount_pct, coupon_type, expires_at, is_active')
    .eq('retailer_key', retailerKey)
    .eq('is_active', true);

  if (couponErr) {
    throw new Error(`[couponIngester] Failed to load digital_coupons: ${couponErr.message}`);
  }

  const coupons = (couponRows ?? []) as DigitalCoupon[];
  if (coupons.length === 0) {
    return { coupons_processed: 0, new_matches: 0, candidates_updated: 0 };
  }

  // 2. Read offer_sources for retailerKey × weekOf
  const { data: offerRows, error: offerErr } = await supabase
    .from('offer_sources')
    .select('id, retailer_key, week_of, normalized_key, dedupe_key, product_name, brand, regular_price_cents, sale_price_cents')
    .eq('retailer_key', retailerKey)
    .eq('week_of', weekOf);

  if (offerErr) {
    throw new Error(`[couponIngester] Failed to load offer_sources: ${offerErr.message}`);
  }

  const offers = (offerRows ?? []) as OfferSource[];
  if (offers.length === 0) {
    return { coupons_processed: coupons.length, new_matches: 0, candidates_updated: 0 };
  }

  // 3. Load match mode from retailer policy
  const { data: policyRow } = await supabase
    .from('retailer_coupon_parameters')
    .select('policy_value')
    .eq('retailer_key', retailerKey)
    .eq('policy_key', 'coupon_match_mode')
    .maybeSingle();

  const matchMode: string =
    (policyRow?.policy_value as { coupon_match_mode?: string } | null)?.coupon_match_mode
    ?? 'token_overlap';

  let newMatchCount      = 0;
  let candidatesUpdated  = 0;

  for (const coupon of coupons) {
    // Ensure coupon has a normalized_key (re-derive if missing)
    const couponKey = coupon.normalized_key?.length
      ? coupon.normalized_key
      : makeNormalizedKey(coupon.brand, coupon.product_name);

    for (const offer of offers) {
      const matched = matchOffer({ ...coupon, normalized_key: couponKey }, offer, matchMode);
      if (!matched) continue;

      // 4. Upsert offer_matches + recalculate final_price_cents
      const couponSavingsCents = coupon.discount_cents > 0
        ? coupon.discount_cents
        : offer.regular_price_cents && coupon.discount_pct
          ? Math.round(offer.regular_price_cents * coupon.discount_pct)
          : 0;

      const basePriceCents = offer.sale_price_cents ?? offer.regular_price_cents ?? 0;
      const finalPriceCents = Math.max(0, basePriceCents - couponSavingsCents);

      const { error: matchErr } = await supabase
        .from('offer_matches')
        .upsert({
          offer_source_id:      offer.id,
          coupon_source_id:     coupon.id,
          retailer_key:         retailerKey,
          week_of:              weekOf,
          normalized_key:       offer.normalized_key,
          final_price_cents:    finalPriceCents,
          coupon_savings_cents: couponSavingsCents,
          match_mode:           matchMode,
          match_confidence:     1.0,
        }, { onConflict: 'offer_source_id,coupon_source_id' });

      if (matchErr) {
        console.error(`[couponIngester] offer_matches upsert failed:`, matchErr.message);
        continue;
      }

      newMatchCount++;

      // 5. Update stack_candidates stack_rank_score for this dedupe_key
      const regularCents = offer.regular_price_cents ?? 0;
      const pct = regularCents > 0
        ? Math.max(0, (regularCents - finalPriceCents) / regularCents)
        : 0;
      const newRankScore = Math.min(1, (pct * 0.6) + 0.4); // has_coupon = true

      const { error: candidateErr } = await supabase
        .from('stack_candidates')
        .update({ stack_rank_score: newRankScore, has_coupon: true })
        .eq('dedupe_key', offer.dedupe_key);

      if (!candidateErr) candidatesUpdated++;
    }
  }

  return {
    coupons_processed: coupons.length,
    new_matches:       newMatchCount,
    candidates_updated: candidatesUpdated,
  };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(
    process.env['SUPABASE_URL'] ?? '',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
  ) as SupabaseClient;

  const [retailerKey, weekOf] = process.argv.slice(2);
  if (!retailerKey || !weekOf) {
    console.error('Usage: npx ts-node couponIngester.ts <retailer_key> <week_of>');
    process.exit(1);
  }

  ingestDigitalCoupons(retailerKey, weekOf, db)
    .then((r) => console.log('Result:', r))
    .catch((e: Error) => { console.error(e); process.exit(1); });
}
