/**
 * offerNormalizer — Normalizes staged flyer deals into the offer catalog
 *
 * normalizeAndPublish(ingestionJobId, supabase):
 *   1. Reads flyer_deal_staging for the job
 *   2. Normalizes keys, maps to OfferType, converts to cents
 *   3. Upserts to offer_sources on dedupe_key
 *   4. Matches against digital_coupons → writes offer_matches
 *   5. Writes to stack_candidates with computed stack_rank_score
 *   6. Updates staging status → 'published'
 *   7. Writes to flyer_publish_log
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { OfferType } from '../../types/stacking';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface StagedDeal {
  id: string;
  ingestion_id: string;
  retailer_key: string;
  week_of: string;
  product_name: string;
  brand: string | null;
  size: string | null;
  sale_price: number | null;   // dollars
  regular_price: number | null;
  deal_type: string;
  quantity_required: number | null;
  category: string | null;
  raw_text: string | null;
  confidence_score: number;
  needs_review: boolean;
  status: string;
}

interface DigitalCoupon {
  id: string;
  retailer_key: string;
  normalized_key: string;
  brand: string | null;
  discount_cents: number;
  discount_pct: number | null;
  expires_at: string | null;
  coupon_type: string;
  is_active: boolean;
}

interface MatchCouponMode {
  coupon_match_mode: string; // 'exact_name' | 'brand_or_name' | 'token_overlap'
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Produces a stable normalized key from brand + product name */
function makeNormalizedKey(brand: string | null, productName: string): string {
  const parts = [brand, productName]
    .filter(Boolean)
    .map((s) => s!.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  return parts.join('_');
}

/** End-of-week date for the given week_of (Monday → following Sunday) */
function endOfWeek(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00Z');
  // week_of is Monday; Sunday is +6 days
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

const DEAL_TYPE_MAP: Record<string, OfferType> = {
  SALE:                 'SALE',
  BOGO:                 'BOGO',
  'BUY 1 GET 1':        'BOGO',
  'B1G1':               'BOGO',
  MULTI:                'MULTI',
  'BUY X GET Y':        'BUY_X_GET_Y',
  'BUY_X_GET_Y':        'BUY_X_GET_Y',
  LOYALTY_PRICE:        'LOYALTY_PRICE',
  LOYALTY:              'LOYALTY_PRICE',
  STORE_COUPON:         'STORE_COUPON',
  MANUFACTURER_COUPON:  'MANUFACTURER_COUPON',
  DIGITAL_COUPON:       'DIGITAL_COUPON',
  DIGITAL:              'DIGITAL_COUPON',
  REBATE:               'REBATE',
};

function mapDealType(raw: string): OfferType {
  const upper = raw.toUpperCase().trim();
  return DEAL_TYPE_MAP[upper] ?? 'SALE';
}

/** Percentage savings given sale price and regular price (0–1) */
function savingsPct(salePriceDollars: number | null, regularPriceDollars: number | null): number {
  if (!salePriceDollars || !regularPriceDollars || regularPriceDollars <= 0) return 0;
  return Math.max(0, (regularPriceDollars - salePriceDollars) / regularPriceDollars);
}

// ─────────────────────────────────────────────────────────────
// Coupon matching
// ─────────────────────────────────────────────────────────────

function matchesTokenOverlap(normalizedKey: string, couponKey: string, minOverlap = 2): boolean {
  const tokenize = (s: string) => s.split('_').filter((t) => t.length > 2);
  const offerTokens = new Set(tokenize(normalizedKey));
  const couponTokens = tokenize(couponKey);
  const overlap = couponTokens.filter((t) => offerTokens.has(t)).length;
  return overlap >= minOverlap;
}

function findMatchingCoupon(
  deal: StagedDeal,
  normalizedKey: string,
  coupons: DigitalCoupon[],
  matchMode: string,
): DigitalCoupon | null {
  for (const coupon of coupons) {
    if (coupon.retailer_key !== deal.retailer_key) continue;

    if (matchMode === 'exact_name') {
      if (coupon.normalized_key === normalizedKey) return coupon;
    } else if (matchMode === 'brand_or_name') {
      const brandMatch = deal.brand && coupon.brand &&
        deal.brand.toLowerCase() === coupon.brand.toLowerCase();
      const keyMatch = coupon.normalized_key.includes(
        (deal.product_name ?? '').toLowerCase().replace(/\s+/g, '_').slice(0, 8),
      );
      if (brandMatch || keyMatch) return coupon;
    } else {
      // token_overlap (default)
      if (matchesTokenOverlap(normalizedKey, coupon.normalized_key)) return coupon;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function normalizeAndPublish(
  ingestionJobId: string,
  supabase: SupabaseClient,
): Promise<{ published: number; matched: number; candidates: number }> {
  // 1. Read all staged deals for this job
  const { data: stagingRows, error: stagingErr } = await supabase
    .from('flyer_deal_staging')
    .select('*')
    .eq('ingestion_id', ingestionJobId)
    .eq('status', 'staged');

  if (stagingErr) {
    throw new Error(`[offerNormalizer] Failed to read staging: ${stagingErr.message}`);
  }

  const deals = (stagingRows ?? []) as StagedDeal[];
  if (deals.length === 0) {
    return { published: 0, matched: 0, candidates: 0 };
  }

  const retailerKey = deals[0].retailer_key;
  const weekOf      = deals[0].week_of;

  // 2. Load digital coupons for this retailer
  const { data: couponRows } = await supabase
    .from('digital_coupons')
    .select('id, retailer_key, normalized_key, brand, discount_cents, discount_pct, expires_at, coupon_type, is_active')
    .eq('retailer_key', retailerKey)
    .eq('is_active', true);

  const coupons = (couponRows ?? []) as DigitalCoupon[];

  // 3. Load retailer coupon_match_mode from retailer_coupon_parameters
  const { data: policyRow } = await supabase
    .from('retailer_coupon_parameters')
    .select('policy_value')
    .eq('retailer_key', retailerKey)
    .eq('policy_key', 'coupon_match_mode')
    .maybeSingle();

  const matchMode: string =
    (policyRow?.policy_value as MatchCouponMode | null)?.coupon_match_mode ?? 'token_overlap';

  const expiresOn = endOfWeek(weekOf);

  let publishedCount  = 0;
  let matchedCount    = 0;
  let candidateCount  = 0;
  const publishedIds: string[] = [];

  for (const deal of deals) {
    try {
      const normalizedKey = makeNormalizedKey(deal.brand, deal.product_name);
      const dedupeKey     = `${retailerKey}::${normalizedKey}::${weekOf}`;
      const offerType     = mapDealType(deal.deal_type);
      const saleCents     = deal.sale_price     != null ? Math.round(deal.sale_price * 100)     : null;
      const regularCents  = deal.regular_price  != null ? Math.round(deal.regular_price * 100)  : null;
      const pct           = savingsPct(deal.sale_price, deal.regular_price);

      // ── 3. Upsert to offer_sources ────────────────────────────
      const offerSourcePayload = {
        retailer_key:     retailerKey,
        week_of:          weekOf,
        normalized_key:   normalizedKey,
        dedupe_key:       dedupeKey,
        product_name:     deal.product_name,
        brand:            deal.brand,
        size:             deal.size,
        category:         deal.category,
        offer_type:       offerType,
        sale_price_cents: saleCents,
        regular_price_cents: regularCents,
        quantity_required: deal.quantity_required,
        expires_on:       expiresOn,
        confidence_score: deal.confidence_score,
        source:           'flyer',
        raw_text:         deal.raw_text,
        ingestion_id:     ingestionJobId,
      };

      const { data: upsertedSource, error: sourceErr } = await supabase
        .from('offer_sources')
        .upsert(offerSourcePayload, { onConflict: 'dedupe_key' })
        .select('id')
        .single();

      if (sourceErr || !upsertedSource) {
        console.error(`[offerNormalizer] offer_sources upsert failed for ${dedupeKey}:`, sourceErr?.message);
        continue;
      }

      publishedCount++;
      publishedIds.push(deal.id);

      // ── 4. Match against digital_coupons ──────────────────────
      const matchedCoupon = findMatchingCoupon(deal, normalizedKey, coupons, matchMode);
      let hasCoupon = false;

      if (matchedCoupon) {
        hasCoupon = true;
        matchedCount++;

        const couponSavingsCents = matchedCoupon.discount_cents > 0
          ? matchedCoupon.discount_cents
          : regularCents && matchedCoupon.discount_pct
            ? Math.round(regularCents * matchedCoupon.discount_pct)
            : 0;

        const finalAfterCouponCents = saleCents != null
          ? Math.max(0, saleCents - couponSavingsCents)
          : regularCents != null
            ? Math.max(0, regularCents - couponSavingsCents)
            : null;

        await supabase
          .from('offer_matches')
          .upsert({
            offer_source_id:    (upsertedSource as { id: string }).id,
            coupon_source_id:   matchedCoupon.id,
            retailer_key:       retailerKey,
            week_of:            weekOf,
            normalized_key:     normalizedKey,
            final_price_cents:  finalAfterCouponCents,
            coupon_savings_cents: couponSavingsCents,
            match_mode:         matchMode,
            match_confidence:   deal.confidence_score,
          }, { onConflict: 'offer_source_id,coupon_source_id' });
      }

      // ── 5. Write to stack_candidates ──────────────────────────
      // stack_rank_score = (savings_pct × 0.6) + (has_coupon × 0.4)
      const stackRankScore = Math.min(1, (pct * 0.6) + (hasCoupon ? 0.4 : 0));

      // Build StackItem-compatible items payload
      const stackItem = {
        id:                 (upsertedSource as { id: string }).id,
        name:               deal.product_name,
        regularPriceCents:  regularCents ?? 0,
        quantity:           deal.quantity_required ?? 1,
        category:           deal.category ?? '',
        brand:              deal.brand ?? '',
        offers: [
          {
            id:          `${(upsertedSource as { id: string }).id}-offer`,
            offerType:   offerType,
            discountCents: offerType === 'SALE' && saleCents && regularCents
              ? regularCents - saleCents
              : undefined,
            discountPct: offerType === 'SALE' && pct > 0 ? pct : undefined,
            stackable:   true,
            expiresAt:   expiresOn,
          },
          ...(matchedCoupon ? [{
            id:            matchedCoupon.id,
            offerType:     matchedCoupon.coupon_type.toUpperCase().includes('MANUFACTURER')
              ? 'MANUFACTURER_COUPON' as const
              : 'DIGITAL_COUPON' as const,
            discountCents: matchedCoupon.discount_cents > 0 ? matchedCoupon.discount_cents : undefined,
            discountPct:   matchedCoupon.discount_pct ?? undefined,
            couponType:    matchedCoupon.coupon_type,
            stackable:     true,
            expiresAt:     matchedCoupon.expires_at ?? expiresOn,
          }] : []),
        ],
      };

      await supabase
        .from('stack_candidates')
        .upsert({
          retailer_key:     retailerKey,
          week_of:          weekOf,
          normalized_key:   normalizedKey,
          dedupe_key:       dedupeKey,
          primary_category: deal.category ?? '',
          primary_brand:    deal.brand ?? '',
          stack_rank_score: stackRankScore,
          items:            [stackItem],
          savings_pct:      pct,
          has_coupon:       hasCoupon,
          ingestion_id:     ingestionJobId,
        }, { onConflict: 'dedupe_key' });

      candidateCount++;
    } catch (err) {
      // Log but continue — don't let one deal crash the batch
      console.error(`[offerNormalizer] Error processing deal ${deal.id}:`, (err as Error).message);
    }
  }

  // 6. Update staging rows to 'published'
  if (publishedIds.length > 0) {
    await supabase
      .from('flyer_deal_staging')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .in('id', publishedIds);
  }

  // 7. Write to flyer_publish_log
  await supabase
    .from('flyer_publish_log')
    .insert({
      ingestion_id:   ingestionJobId,
      retailer_key:   retailerKey,
      week_of:        weekOf,
      deals_staged:   deals.length,
      deals_published: publishedCount,
      coupons_matched: matchedCount,
      candidates_written: candidateCount,
      published_at:   new Date().toISOString(),
    });

  return { published: publishedCount, matched: matchedCount, candidates: candidateCount };
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

  const jobId = process.argv[2];
  if (!jobId) { console.error('Usage: npx ts-node offerNormalizer.ts <job_id>'); process.exit(1); }

  normalizeAndPublish(jobId, db)
    .then((r) => console.log('Result:', r))
    .catch((e: Error) => { console.error(e); process.exit(1); });
}
