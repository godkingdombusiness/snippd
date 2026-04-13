/**
 * stackCalculator — pure price calculation (no I/O)
 *
 * calculateStackLine(item, policy) → StackLineResult
 *
 * Offer application order (canonical):
 *   1. SALE
 *   2. BOGO
 *   3. MULTI / BUY_X_GET_Y
 *   4. LOYALTY_PRICE
 *   5. STORE_COUPON
 *   6. MANUFACTURER_COUPON
 *   7. DIGITAL_COUPON
 *   8. REBATE  (tracked separately — does NOT reduce line total)
 *
 * Each step uses the running per-unit price as its basis.
 * Price floor: 0 cents (coupons cannot create a negative price).
 * Rounding applied at each step per retailer roundingMode.
 */

import {
  AppliedOffer,
  OfferType,
  RetailerPolicy,
  RoundingMode,
  StackItem,
  StackLineResult,
  StackOffer,
  StackWarning,
} from '../../types/stacking';

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'ceil':  return Math.ceil(value);
    case 'round': return Math.round(value);
    default:      return Math.floor(value);
  }
}

function clampZero(value: number): number {
  return Math.max(0, value);
}

// ─────────────────────────────────────────────────────────────
// Canonical application order
// ─────────────────────────────────────────────────────────────

const OFFER_ORDER: OfferType[] = [
  'SALE',
  'BOGO',
  'MULTI',
  'BUY_X_GET_Y',
  'LOYALTY_PRICE',
  'STORE_COUPON',
  'MANUFACTURER_COUPON',
  'DIGITAL_COUPON',
  'REBATE',
];

function sortOffers(offers: StackOffer[]): StackOffer[] {
  return [...offers].sort(
    (a, b) => OFFER_ORDER.indexOf(a.offerType) - OFFER_ORDER.indexOf(b.offerType),
  );
}

// ─────────────────────────────────────────────────────────────
// BOGO calculation (per-unit price adjustment)
// ─────────────────────────────────────────────────────────────

function applyBogo(
  runningPrice: number,
  qty: number,
  offer: StackOffer,
  mode: RoundingMode,
): number {
  if (qty < 2) return runningPrice; // BOGO needs at least 2 units

  const pairs = Math.floor(qty / 2);
  const bogoModel = offer.bogoModel ?? 'second_free';

  if (bogoModel === 'half_off_both') {
    // Every unit is 50% off
    return applyRounding(runningPrice * 0.5, mode);
  }

  // second_free / cheapest_free: for every 2 units, one is free
  // Effective per-unit price = (pairs * price + unpaired * price) / qty
  // = ((qty - pairs) * price) / qty
  const paidUnits = qty - pairs;
  return applyRounding((paidUnits * runningPrice) / qty, mode);
}

// ─────────────────────────────────────────────────────────────
// Single-offer application
// ─────────────────────────────────────────────────────────────

interface ApplyResult {
  newPrice: number;
  lineRebateDelta: number;
  applied: boolean;
}

function applyOffer(
  offer: StackOffer,
  runningPrice: number,
  qty: number,
  mode: RoundingMode,
): ApplyResult {
  let newPrice = runningPrice;
  let lineRebateDelta = 0;

  switch (offer.offerType) {
    case 'SALE': {
      if (offer.discountPct !== undefined) {
        newPrice = applyRounding(runningPrice * (1 - offer.discountPct), mode);
      } else if (offer.discountCents !== undefined) {
        newPrice = runningPrice - offer.discountCents;
      }
      break;
    }

    case 'BOGO': {
      newPrice = applyBogo(runningPrice, qty, offer, mode);
      break;
    }

    case 'MULTI':
    case 'BUY_X_GET_Y': {
      const buyQ = offer.buyQty ?? 1;
      const getQ = offer.getQty ?? 1;
      const threshold = buyQ + getQ;
      if (qty >= threshold) {
        const freeSets = Math.floor(qty / threshold);
        const freeUnits = freeSets * getQ;
        // Distribute savings evenly across all units
        const savingsPerUnit = applyRounding((freeUnits * runningPrice) / qty, mode);
        newPrice = runningPrice - savingsPerUnit;
      }
      break;
    }

    case 'LOYALTY_PRICE': {
      if (offer.finalPriceCents !== undefined) {
        // Replace price entirely if loyalty price is lower
        newPrice = Math.min(runningPrice, offer.finalPriceCents);
      } else if (offer.discountPct !== undefined) {
        newPrice = applyRounding(runningPrice * (1 - offer.discountPct), mode);
      } else if (offer.discountCents !== undefined) {
        newPrice = runningPrice - offer.discountCents;
      }
      break;
    }

    case 'STORE_COUPON':
    case 'MANUFACTURER_COUPON':
    case 'DIGITAL_COUPON': {
      if (offer.discountCents !== undefined) {
        newPrice = runningPrice - offer.discountCents;
      } else if (offer.discountPct !== undefined) {
        newPrice = applyRounding(runningPrice * (1 - offer.discountPct), mode);
      }
      break;
    }

    case 'REBATE': {
      // Rebate does not change the running price — it's paid back later
      lineRebateDelta = (offer.rebateCents ?? 0) * qty;
      return { newPrice: runningPrice, lineRebateDelta, applied: true };
    }
  }

  newPrice = clampZero(newPrice);

  return { newPrice, lineRebateDelta: 0, applied: newPrice !== runningPrice };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function calculateStackLine(
  item: StackItem,
  policy: RetailerPolicy,
): StackLineResult {
  const { roundingMode } = policy;
  const qty = item.quantity;
  const regularPrice = item.regularPriceCents;

  const orderedOffers = sortOffers(item.offers);

  let runningPrice = regularPrice;
  let salePriceCents = regularPrice; // price after SALE+BOGO only
  let lineRebateCents = 0;

  const appliedOffers: AppliedOffer[] = [];
  const warnings: StackWarning[] = [];

  const saleBogoDone = { done: false };

  for (const offer of orderedOffers) {
    const priceBefore = runningPrice;
    const { newPrice, lineRebateDelta } = applyOffer(offer, runningPrice, qty, roundingMode);

    lineRebateCents += lineRebateDelta;
    runningPrice = newPrice;

    // Track the sale price snapshot (after SALE + BOGO, before coupons)
    if (!saleBogoDone.done && !['SALE', 'BOGO', 'MULTI', 'BUY_X_GET_Y'].includes(offer.offerType)) {
      salePriceCents = priceBefore;
      saleBogoDone.done = true;
    }

    const savedPerUnit = priceBefore - runningPrice;

    // Warn if coupon pushed price to floor
    if (
      ['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(offer.offerType) &&
      runningPrice === 0 &&
      priceBefore > 0
    ) {
      warnings.push({
        code: 'COUPON_FLOOR_APPLIED',
        offerId: offer.id,
        itemId: item.id,
        message: `Offer ${offer.id} would have exceeded item price; clamped to $0.00`,
      });
    }

    appliedOffers.push({
      offerId:                offer.id,
      offerType:              offer.offerType,
      description:            offer.description,
      savingsCents:           offer.offerType === 'REBATE' ? lineRebateDelta : Math.max(0, savedPerUnit),
      appliedToQty:           qty,
      runningPriceBeforeCents: priceBefore,
      runningPriceAfterCents:  runningPrice,
    });
  }

  // If we only had SALE/BOGO offers and no coupons afterward
  if (!saleBogoDone.done) {
    salePriceCents = runningPrice;
  }

  const finalPriceCents      = runningPrice;
  const lineTotalRegularCents = regularPrice * qty;
  const lineTotalFinalCents   = finalPriceCents * qty;
  const lineSavingsCents      = lineTotalRegularCents - lineTotalFinalCents;

  return {
    itemId:               item.id,
    itemName:             item.name,
    quantity:             qty,
    regularPriceCents:    regularPrice,
    salePriceCents,
    finalPriceCents,
    lineTotalRegularCents,
    lineTotalFinalCents,
    lineSavingsCents:     Math.max(0, lineSavingsCents),
    lineRebateCents,
    appliedOffers,
    rejectedOfferIds:     [],
    warnings,
  };
}
