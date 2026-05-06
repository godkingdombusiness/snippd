// Service layer for the normalized_offers table.
//
// SAFE: Does NOT query or modify any existing table.
// Does NOT interfere with: app_home_feed, offer_sources, stack_candidates,
//   digital_coupons, rebate_offers, user_preferences, or HomeScreen queries.
//
// All functions have safe fallbacks — callers will never see a thrown error.

import { supabase } from '../../lib/supabase';
import {
  normalizeOffer,
  type RawOffer,
  type NormalizedOffer,
} from '../lib/offerNormalization';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SaveResult {
  saved: number;
  errors: number;
}

// Row shape as stored in DB (includes generated fields)
type StoredOffer = NormalizedOffer & {
  id: string;
  created_at: string;
  updated_at: string;
};

// ── 1. normalizeAndSaveOffers ─────────────────────────────────────────────────

/**
 * Normalizes an array of raw offers and saves them to normalized_offers.
 *
 * - Calls normalizeOffer() on each input
 * - If source_offer_id is present: upserts (update-or-insert) by that key
 * - If source_offer_id is absent: inserts a new row
 * - Never touches existing tables
 * - Returns counts; never throws
 */
export async function normalizeAndSaveOffers(
  rawOffers: RawOffer[],
): Promise<SaveResult> {
  if (!rawOffers.length) return { saved: 0, errors: 0 };

  const normalized = rawOffers.map(normalizeOffer);
  let saved = 0;
  let errors = 0;

  for (const offer of normalized) {
    try {
      const row = {
        source_offer_id:       offer.source_offer_id,
        retailer:              offer.retailer,
        product_name:          offer.product_name,
        brand:                 offer.brand,
        category:              offer.category,
        size_text:             offer.size_text,
        normalized_size:       offer.normalized_size,
        normalized_unit:       offer.normalized_unit,
        price_cents:           offer.price_cents,
        regular_price_cents:   offer.regular_price_cents,
        deal_type:             offer.deal_type,
        quantity_required:     offer.quantity_required,
        quantity_received:     offer.quantity_received,
        final_unit_price_cents: offer.final_unit_price_cents,
        savings_cents:         offer.savings_cents,
        confidence_score:      offer.confidence_score,
        raw_source:            offer.raw_source,
        updated_at:            new Date().toISOString(),
      };

      if (offer.source_offer_id) {
        // Upsert: the partial unique index uq_normalized_offers_source_id
        // makes this safe — inserts on new source_offer_id, updates on existing
        const { error } = await supabase
          .from('normalized_offers')
          .upsert(row, { onConflict: 'source_offer_id' });
        if (error) throw error;
      } else {
        // No source id — always insert fresh
        const { error } = await supabase
          .from('normalized_offers')
          .insert(row);
        if (error) throw error;
      }

      saved++;
    } catch {
      // Log but never surface to caller
      errors++;
    }
  }

  return { saved, errors };
}

// ── 2. getNormalizedOffers ────────────────────────────────────────────────────

/**
 * Returns the most recently created normalized offers (newest first).
 * Safe fallback: returns [] if the table is empty or does not exist yet.
 */
export async function getNormalizedOffers(limit = 100): Promise<StoredOffer[]> {
  try {
    const { data, error } = await supabase
      .from('normalized_offers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as StoredOffer[];
  } catch {
    return [];
  }
}

// ── 3. getBestSavingsOffers ───────────────────────────────────────────────────

/**
 * Returns offers sorted by savings_cents descending.
 *
 * Filters:
 * - confidence_score >= 0.5 (low-confidence offers excluded)
 * - savings_cents IS NOT NULL (only offers with real, computable savings)
 *
 * Per spec: never show savings if regular_price_cents was missing
 * (calculateSavings() already enforces this — savings_cents will be null).
 *
 * Safe fallback: returns [] on any error.
 */
export async function getBestSavingsOffers(limit = 10): Promise<StoredOffer[]> {
  try {
    const { data, error } = await supabase
      .from('normalized_offers')
      .select('*')
      .gte('confidence_score', 0.5)
      .not('savings_cents', 'is', null)
      .order('savings_cents', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as StoredOffer[];
  } catch {
    return [];
  }
}
