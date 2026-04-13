/**
 * stackValidator — pure validation (no I/O)
 *
 * validateOfferSet(items, policy) → ValidationResult
 *
 * Checks (in order):
 *  1. Expired offers                    → OFFER_EXPIRED
 *  2. Quantity requirements             → QUANTITY_REQUIRED
 *  3. Non-stackable conflict            → NON_STACKABLE
 *  4. Mutual exclusion groups           → MUTUAL_EXCLUSION  (keeps highest priority)
 *  5. Coupon type not in policy         → COUPON_TYPE_NOT_ALLOWED
 *  6. sale + digital blocked            → SALE_DIGITAL_BLOCKED
 *  7. sale + loyalty blocked            → SALE_LOYALTY_BLOCKED
 *  8. BOGO + coupon blocked             → BOGO_COUPON_BLOCKED
 *  9. Manufacturer coupon limit         → MANUFACTURER_LIMIT (keeps highest value)
 * 10. Store coupon limit                → STORE_LIMIT        (keeps highest value)
 * 11. Max redemptions                   → MAX_REDEMPTIONS_REACHED
 */

import {
  RetailerPolicy,
  StackItem,
  StackOffer,
  StackWarning,
  ValidationResult,
} from '../../types/stacking';

// ─────────────────────────────────────────────────────────────
// Item-level validator
// ─────────────────────────────────────────────────────────────

function validateItemOffers(
  item: StackItem,
  policy: RetailerPolicy,
  basketMfrCount: { n: number },
  basketStoreCount: { n: number },
): { validOffers: StackOffer[]; rejectedIds: string[]; warnings: StackWarning[] } {
  const warnings: StackWarning[] = [];
  const rejectedIds: string[] = [];
  const now = new Date().toISOString();
  let candidates = [...item.offers];

  // 1. Expired offers
  candidates = candidates.filter((o) => {
    if (o.expiresAt && o.expiresAt < now) {
      warnings.push({
        code: 'OFFER_EXPIRED',
        offerId: o.id,
        itemId: item.id,
        message: `Offer ${o.id} expired at ${o.expiresAt}`,
      });
      rejectedIds.push(o.id);
      return false;
    }
    return true;
  });

  // 2. Quantity requirements
  candidates = candidates.filter((o) => {
    if (o.requiredQty !== undefined && item.quantity < o.requiredQty) {
      warnings.push({
        code: 'QUANTITY_REQUIRED',
        offerId: o.id,
        itemId: item.id,
        message: `Offer ${o.id} requires qty ≥ ${o.requiredQty} (have ${item.quantity})`,
      });
      rejectedIds.push(o.id);
      return false;
    }
    return true;
  });

  // 3. Max redemptions
  candidates = candidates.filter((o) => {
    if (o.maxRedemptions !== undefined && o.maxRedemptions > 0 && item.quantity > o.maxRedemptions) {
      // Offer is still valid but will be capped — warn, do not reject
      warnings.push({
        code: 'MAX_REDEMPTIONS_REACHED',
        offerId: o.id,
        itemId: item.id,
        message: `Offer ${o.id} capped at ${o.maxRedemptions} redemption(s)`,
      });
    }
    return true;
  });

  // 4. Non-stackable: keep only the first, reject the rest (regardless of type)
  const nonStackable = candidates.filter((o) => !o.stackable);
  if (nonStackable.length > 1) {
    const keep = nonStackable[0];
    for (const o of nonStackable.slice(1)) {
      warnings.push({
        code: 'NON_STACKABLE',
        offerId: o.id,
        itemId: item.id,
        message: `Offer ${o.id} is non-stackable; kept ${keep.id} instead`,
      });
      rejectedIds.push(o.id);
    }
    candidates = candidates.filter((o) => o.stackable || o.id === nonStackable[0].id);
  }

  // 5. Mutual exclusion groups — keep highest priority
  const groups = new Map<string, StackOffer[]>();
  for (const o of candidates) {
    if (o.exclusionGroup) {
      const g = groups.get(o.exclusionGroup) ?? [];
      g.push(o);
      groups.set(o.exclusionGroup, g);
    }
  }
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const winner = sorted[0];
    for (const loser of sorted.slice(1)) {
      warnings.push({
        code: 'MUTUAL_EXCLUSION',
        offerId: loser.id,
        itemId: item.id,
        message: `Offer ${loser.id} (priority ${loser.priority ?? 0}) excluded by ${winner.id} (priority ${winner.priority ?? 0}) in group "${loser.exclusionGroup}"`,
      });
      rejectedIds.push(loser.id);
      candidates = candidates.filter((c) => c.id !== loser.id);
    }
  }

  // 6. Coupon type allowed by policy
  if (policy.allowedCouponTypes.length > 0) {
    const allowed = policy.allowedCouponTypes.map((t) => t.toLowerCase());
    candidates = candidates.filter((o) => {
      if (o.couponType && !allowed.includes(o.couponType.toLowerCase())) {
        warnings.push({
          code: 'COUPON_TYPE_NOT_ALLOWED',
          offerId: o.id,
          itemId: item.id,
          message: `Coupon type "${o.couponType}" is not allowed at ${policy.retailerKey} (allowed: ${policy.allowedCouponTypes.join(', ')})`,
        });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  // Derive current set flags for combination rules
  const hasSale    = candidates.some((o) => o.offerType === 'SALE');
  const hasBogo    = candidates.some((o) => o.offerType === 'BOGO');
  const hasLoyalty = candidates.some((o) => o.offerType === 'LOYALTY_PRICE');
  const hasDigital = candidates.some((o) => o.offerType === 'DIGITAL_COUPON');
  const hasCoupon  = candidates.some((o) =>
    ['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType),
  );

  // 7. sale + digital blocked
  if (policy.blockSaleAndDigital && hasSale && hasDigital) {
    candidates = candidates.filter((o) => {
      if (o.offerType === 'DIGITAL_COUPON') {
        warnings.push({
          code: 'SALE_DIGITAL_BLOCKED',
          offerId: o.id,
          itemId: item.id,
          message: `${policy.retailerKey} policy blocks DIGITAL_COUPON when a SALE is present`,
        });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  // 8. sale + loyalty blocked
  if (policy.blockSaleAndLoyalty && hasSale && hasLoyalty) {
    candidates = candidates.filter((o) => {
      if (o.offerType === 'LOYALTY_PRICE') {
        warnings.push({
          code: 'SALE_LOYALTY_BLOCKED',
          offerId: o.id,
          itemId: item.id,
          message: `${policy.retailerKey} policy blocks LOYALTY_PRICE when a SALE is present`,
        });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  // 9. BOGO + coupon blocked
  if (policy.blockBogoAndCoupon && hasBogo && hasCoupon) {
    candidates = candidates.filter((o) => {
      if (['STORE_COUPON', 'MANUFACTURER_COUPON', 'DIGITAL_COUPON'].includes(o.offerType)) {
        warnings.push({
          code: 'BOGO_COUPON_BLOCKED',
          offerId: o.id,
          itemId: item.id,
          message: `${policy.retailerKey} policy blocks coupons when a BOGO is present`,
        });
        rejectedIds.push(o.id);
        return false;
      }
      return true;
    });
  }

  // 10. Manufacturer coupon limit (keep highest discountCents)
  const mfrCoupons = candidates.filter((o) => o.offerType === 'MANUFACTURER_COUPON');
  if (mfrCoupons.length > policy.maxManufacturerCoupons) {
    const sorted = [...mfrCoupons].sort((a, b) => (b.discountCents ?? 0) - (a.discountCents ?? 0));
    const reject = sorted.slice(policy.maxManufacturerCoupons);
    for (const o of reject) {
      warnings.push({
        code: 'MANUFACTURER_LIMIT',
        offerId: o.id,
        itemId: item.id,
        message: `Manufacturer coupon limit (${policy.maxManufacturerCoupons}) reached; rejected ${o.id}`,
      });
      rejectedIds.push(o.id);
      candidates = candidates.filter((c) => c.id !== o.id);
    }
  }
  basketMfrCount.n += candidates.filter((o) => o.offerType === 'MANUFACTURER_COUPON').length;

  // 11. Store coupon limit (keep highest discountCents)
  const storeCoupons = candidates.filter((o) => o.offerType === 'STORE_COUPON');
  if (storeCoupons.length > policy.maxStoreCoupons) {
    const sorted = [...storeCoupons].sort((a, b) => (b.discountCents ?? 0) - (a.discountCents ?? 0));
    const reject = sorted.slice(policy.maxStoreCoupons);
    for (const o of reject) {
      warnings.push({
        code: 'STORE_LIMIT',
        offerId: o.id,
        itemId: item.id,
        message: `Store coupon limit (${policy.maxStoreCoupons}) reached; rejected ${o.id}`,
      });
      rejectedIds.push(o.id);
      candidates = candidates.filter((c) => c.id !== o.id);
    }
  }
  basketStoreCount.n += candidates.filter((o) => o.offerType === 'STORE_COUPON').length;

  return { validOffers: candidates, rejectedIds, warnings };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function validateOfferSet(
  items: StackItem[],
  policy: RetailerPolicy,
): ValidationResult {
  const allRejectedIds: string[] = [];
  const allWarnings: StackWarning[] = [];
  const validItems: StackItem[] = [];

  const basketMfrCount   = { n: 0 };
  const basketStoreCount = { n: 0 };

  for (const item of items) {
    const { validOffers, rejectedIds, warnings } = validateItemOffers(
      item,
      policy,
      basketMfrCount,
      basketStoreCount,
    );
    allRejectedIds.push(...rejectedIds);
    allWarnings.push(...warnings);
    validItems.push({ ...item, offers: validOffers });
  }

  return {
    validItems,
    rejectedOfferIds: [...new Set(allRejectedIds)],
    warnings: allWarnings,
  };
}
