// Pure normalization helpers for the Normalized Offer Engine.
// No imports, no side effects, no database calls.
// Safe to use anywhere — client, server, tests.

export type DealType = 'sale' | 'bogo' | 'multibuy' | 'coupon' | 'regular' | 'unknown';

// ── Input / output types ──────────────────────────────────────────────────────

export interface RawOffer {
  retailer: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  price_text?: string | null;
  size_text?: string | null;
  regular_price_cents?: number | null;
  source_offer_id?: string | null;
  raw_source?: Record<string, unknown>;
}

export interface NormalizedOffer {
  id?: string;                          // present when read from DB
  source_offer_id: string | null;
  retailer: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  size_text: string | null;
  normalized_size: number | null;
  normalized_unit: string | null;
  price_cents: number | null;
  regular_price_cents: number | null;
  deal_type: DealType;
  quantity_required: number;
  quantity_received: number;
  final_unit_price_cents: number | null;
  savings_cents: number | null;
  confidence_score: number;
  raw_source: Record<string, unknown>;
}

export interface NormalizedPrice {
  price_cents: number | null;
  quantity_required: number;
  quantity_received: number;
  deal_type: DealType;
  confidence_score: number;
}

export interface NormalizedSize {
  normalized_size: number | null;
  normalized_unit: string | null;
  confidence_score: number;
}

export interface SavingsResult {
  final_unit_price_cents: number | null;
  savings_cents: number | null;
}

// ── Unit normalization map ────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', liters: 'l',
  ct: 'ct', count: 'ct', counts: 'ct', pk: 'ct', pack: 'ct', pcs: 'ct', pieces: 'ct',
  pt: 'pt', pint: 'pt',
  qt: 'qt', quart: 'qt',
  gal: 'gal', gallon: 'gal',
};

// ── 1. normalizePrice ─────────────────────────────────────────────────────────

/**
 * Parses free-form price text into a structured price object.
 *
 * Handles: "$5.99", "2 for $10", "3/$5", "Buy 1 Get 1 Free", "BOGO",
 *          "$1.99/lb", "$1.50 off", "50% off"
 */
export function normalizePrice(rawText: string): NormalizedPrice {
  const text = rawText.trim();

  // ── BOGO / Buy 1 Get 1 ───────────────────────────────────────
  if (/\bbogo\b|buy\s*1\s*get\s*1|b1g1/i.test(text)) {
    return {
      price_cents: null,
      quantity_required: 1,
      quantity_received: 2,
      deal_type: 'bogo',
      confidence_score: 0.9,
    };
  }

  // ── Buy X Get Y (e.g. "Buy 2 Get 1 Free") ────────────────────
  const bxgyMatch = text.match(/buy\s*(\d+)\s*get\s*(\d+)/i);
  if (bxgyMatch) {
    return {
      price_cents: null,
      quantity_required: parseInt(bxgyMatch[1], 10),
      quantity_received: parseInt(bxgyMatch[1], 10) + parseInt(bxgyMatch[2], 10),
      deal_type: 'bogo',
      confidence_score: 0.88,
    };
  }

  // ── "$1.50 off" coupon ────────────────────────────────────────
  const couponOffMatch = text.match(/^\$?([\d.]+)\s*off\b/i);
  if (couponOffMatch) {
    return {
      price_cents: Math.round(parseFloat(couponOffMatch[1]) * 100),
      quantity_required: 1,
      quantity_received: 1,
      deal_type: 'coupon',
      confidence_score: 0.85,
    };
  }

  // ── "50% off" percent coupon ──────────────────────────────────
  const pctOffMatch = text.match(/^([\d.]+)%\s*off/i);
  if (pctOffMatch) {
    return {
      price_cents: null,   // need regular price to compute; caller must handle
      quantity_required: 1,
      quantity_received: 1,
      deal_type: 'coupon',
      confidence_score: 0.8,
    };
  }

  // ── "2 for $10" / "3/$5" multibuy ────────────────────────────
  const multiMatch = text.match(/^(\d+)\s*(?:for|\/)\s*\$?([\d.]+)/i);
  if (multiMatch) {
    const qty = parseInt(multiMatch[1], 10);
    const totalCents = Math.round(parseFloat(multiMatch[2]) * 100);
    return {
      price_cents: totalCents,
      quantity_required: qty,
      quantity_received: qty,
      deal_type: 'multibuy',
      confidence_score: 0.9,
    };
  }

  // ── "$1.99/lb" or "$2.49/oz" per-unit price ───────────────────
  const perUnitMatch = text.match(/^\$?([\d.]+)\s*\/\s*(?:lb|oz|kg|g|ct|ea)\b/i);
  if (perUnitMatch) {
    return {
      price_cents: Math.round(parseFloat(perUnitMatch[1]) * 100),
      quantity_required: 1,
      quantity_received: 1,
      deal_type: 'sale',
      confidence_score: 0.85,
    };
  }

  // ── "$5.99" simple dollar price ───────────────────────────────
  const simpleMatch = text.match(/^\$?([\d]+(?:\.\d{1,2})?)$/);
  if (simpleMatch) {
    return {
      price_cents: Math.round(parseFloat(simpleMatch[1]) * 100),
      quantity_required: 1,
      quantity_received: 1,
      deal_type: 'sale',
      confidence_score: 0.95,
    };
  }

  // ── Unrecognized ──────────────────────────────────────────────
  return {
    price_cents: null,
    quantity_required: 1,
    quantity_received: 1,
    deal_type: 'unknown',
    confidence_score: 0.1,
  };
}

// ── 2. normalizeSize ──────────────────────────────────────────────────────────

/**
 * Parses a size/weight string into a canonical numeric value + unit.
 *
 * Handles: "16 oz", "1 lb", "500 g", "12 ct", "2 L", "1.5 kg", "32 fl oz"
 */
export function normalizeSize(rawText: string): NormalizedSize {
  const empty: NormalizedSize = { normalized_size: null, normalized_unit: null, confidence_score: 0 };
  if (!rawText?.trim()) return empty;

  const text = rawText.trim();

  // ── "32 fl oz" — must check before single-char unit match ────
  const flOzMatch = text.match(/^([\d.]+)\s*fl\.?\s*oz\b/i);
  if (flOzMatch) {
    const size = parseFloat(flOzMatch[1]);
    if (!isNaN(size)) {
      return { normalized_size: size, normalized_unit: 'fl oz', confidence_score: 0.95 };
    }
  }

  // ── General: "16 oz", "500 g", "12 ct" ───────────────────────
  const match = text.match(/^([\d.]+)\s*([a-z]+)\.?\b/i);
  if (match) {
    const size = parseFloat(match[1]);
    const rawUnit = match[2].toLowerCase();
    const unit = UNIT_MAP[rawUnit] ?? null;
    if (unit && !isNaN(size) && size > 0) {
      return { normalized_size: size, normalized_unit: unit, confidence_score: 0.9 };
    }
  }

  // ── Number only (e.g. "16") — ambiguous unit ─────────────────
  const numberOnly = text.match(/^([\d.]+)$/);
  if (numberOnly) {
    const size = parseFloat(numberOnly[1]);
    if (!isNaN(size) && size > 0) {
      return { normalized_size: size, normalized_unit: null, confidence_score: 0.3 };
    }
  }

  return { normalized_size: null, normalized_unit: null, confidence_score: 0.2 };
}

// ── 3. detectDealType ─────────────────────────────────────────────────────────

/**
 * Classifies raw text into a deal type without full price parsing.
 * Useful as a fast pre-filter before normalizePrice.
 */
export function detectDealType(rawText: string): DealType {
  const text = rawText.trim();

  if (/\bbogo\b|buy\s*1\s*get\s*1|b1g1|buy\s*\d+\s*get\s*\d+/i.test(text)) return 'bogo';
  if (/^\d+\s*(?:for|\/)\s*\$/.test(text)) return 'multibuy';
  if (/\$?[\d.]+\s*off\b/i.test(text)) return 'coupon';
  if (/\d+%\s*off/i.test(text)) return 'coupon';
  if (/\$[\d.]+/.test(text)) return 'sale';
  if (/regular\s*price|everyday\s*price/i.test(text)) return 'regular';

  return 'unknown';
}

// ── 4. calculateSavings ───────────────────────────────────────────────────────

/**
 * Computes final_unit_price_cents and savings_cents from a normalized offer.
 *
 * Rules:
 * - BOGO: unit price = price_cents / 2 (buy one, get one — effective per-unit)
 * - multibuy: unit price = total_price / quantity_received
 * - coupon: price_cents IS the discount amount; savings = price_cents
 * - sale: savings = regular - price (only if regular_price_cents is known)
 * - Never returns negative savings — clamps to null
 * - If regular_price_cents is missing, savings_cents is null (not invented)
 */
export function calculateSavings(offer: {
  price_cents: number | null;
  regular_price_cents: number | null;
  deal_type: DealType;
  quantity_required: number;
  quantity_received: number;
}): SavingsResult {
  const { price_cents, regular_price_cents, deal_type, quantity_received } = offer;

  if (price_cents == null && deal_type !== 'coupon') {
    return { final_unit_price_cents: null, savings_cents: null };
  }

  let finalUnit: number | null = null;
  let savings: number | null = null;

  switch (deal_type) {
    case 'bogo': {
      if (price_cents == null) {
        // price unknown — can still compute if regular_price_cents present
        finalUnit = regular_price_cents != null ? Math.round(regular_price_cents / 2) : null;
        savings   = regular_price_cents != null ? Math.round(regular_price_cents / 2) : null;
      } else {
        finalUnit = Math.round(price_cents / 2);
        savings   = regular_price_cents != null
          ? Math.max(0, regular_price_cents - finalUnit)
          : null;
      }
      break;
    }

    case 'multibuy': {
      const qty = Math.max(1, quantity_received);
      finalUnit = price_cents != null ? Math.round(price_cents / qty) : null;
      savings   = (finalUnit != null && regular_price_cents != null)
        ? Math.max(0, regular_price_cents - finalUnit)
        : null;
      break;
    }

    case 'coupon': {
      // price_cents holds the discount value for coupon deal type
      const discountCents = price_cents ?? 0;
      if (regular_price_cents != null) {
        finalUnit = Math.max(0, regular_price_cents - discountCents);
        savings   = discountCents;
      } else {
        // Can't calculate final price without a base price
        finalUnit = null;
        savings   = null;
      }
      break;
    }

    case 'sale':
    case 'regular':
    default: {
      finalUnit = price_cents;
      savings   = (price_cents != null && regular_price_cents != null)
        ? Math.max(0, regular_price_cents - price_cents)
        : null;
      break;
    }
  }

  // Safety clamp — never return negative values
  if (savings != null && savings < 0) savings = null;
  if (finalUnit != null && finalUnit < 0) finalUnit = null;

  return { final_unit_price_cents: finalUnit, savings_cents: savings };
}

// ── 5. normalizeOffer ─────────────────────────────────────────────────────────

/**
 * Combines all helpers into a single normalized offer object.
 * Accepts a raw offer with free-form price and size text.
 */
export function normalizeOffer(raw: RawOffer): NormalizedOffer {
  const priceResult: NormalizedPrice = raw.price_text
    ? normalizePrice(raw.price_text)
    : { price_cents: null, quantity_required: 1, quantity_received: 1, deal_type: 'unknown', confidence_score: 0 };

  const sizeResult: NormalizedSize = raw.size_text
    ? normalizeSize(raw.size_text)
    : { normalized_size: null, normalized_unit: null, confidence_score: 0 };

  const savingsResult = calculateSavings({
    price_cents:         priceResult.price_cents,
    regular_price_cents: raw.regular_price_cents ?? null,
    deal_type:           priceResult.deal_type,
    quantity_required:   priceResult.quantity_required,
    quantity_received:   priceResult.quantity_received,
  });

  // Blend confidence: if size was parseable, average it in; otherwise use price confidence only
  const confidence = sizeResult.confidence_score > 0
    ? parseFloat(((priceResult.confidence_score + sizeResult.confidence_score) / 2).toFixed(3))
    : priceResult.confidence_score;

  return {
    source_offer_id:       raw.source_offer_id ?? null,
    retailer:              raw.retailer,
    product_name:          raw.product_name,
    brand:                 raw.brand ?? null,
    category:              raw.category ?? null,
    size_text:             raw.size_text ?? null,
    normalized_size:       sizeResult.normalized_size,
    normalized_unit:       sizeResult.normalized_unit,
    price_cents:           priceResult.price_cents,
    regular_price_cents:   raw.regular_price_cents ?? null,
    deal_type:             priceResult.deal_type,
    quantity_required:     priceResult.quantity_required,
    quantity_received:     priceResult.quantity_received,
    final_unit_price_cents: savingsResult.final_unit_price_cents,
    savings_cents:         savingsResult.savings_cents,
    confidence_score:      confidence,
    raw_source:            raw.raw_source ?? {},
  };
}
