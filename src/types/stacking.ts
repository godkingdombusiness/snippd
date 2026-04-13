// ============================================================
// Snippd — Coupon Stacking Engine Types
// Used by: policyLoader, stackValidator, stackCalculator, stackingEngine
// Convention: camelCase (computation-facing, not DB-facing)
// ============================================================

export type OfferType =
  | 'SALE'
  | 'BOGO'
  | 'MULTI'
  | 'BUY_X_GET_Y'
  | 'LOYALTY_PRICE'
  | 'STORE_COUPON'
  | 'MANUFACTURER_COUPON'
  | 'DIGITAL_COUPON'
  | 'REBATE';

/** How a BOGO discount distributes across units */
export type BogoModel =
  | 'cheapest_free'  // cheapest of the pair is free
  | 'half_off_both'  // both units at 50% off
  | 'second_free';   // second unit is free (same price pair)

export type RoundingMode = 'floor' | 'round' | 'ceil';

export type WarningCode =
  | 'OFFER_EXPIRED'
  | 'NON_STACKABLE'
  | 'MUTUAL_EXCLUSION'
  | 'POLICY_BLOCKED'
  | 'QUANTITY_REQUIRED'
  | 'MAX_REDEMPTIONS_REACHED'
  | 'COUPON_FLOOR_APPLIED'
  | 'MANUFACTURER_LIMIT'
  | 'STORE_LIMIT'
  | 'SALE_DIGITAL_BLOCKED'
  | 'BOGO_COUPON_BLOCKED'
  | 'SALE_LOYALTY_BLOCKED'
  | 'COUPON_TYPE_NOT_ALLOWED';

// ============================================================
// OFFER
// ============================================================

export interface StackOffer {
  id: string;
  offerType: OfferType;
  description?: string;

  /** Fixed discount in cents (for SALE/COUPON types) */
  discountCents?: number;
  /** Percentage discount 0.0–1.0 (alternative to discountCents) */
  discountPct?: number;
  /** Replacement price in cents (for LOYALTY_PRICE) */
  finalPriceCents?: number;

  /** BOGO behavior */
  bogoModel?: BogoModel;

  /** For BUY_X_GET_Y: buy X units to get Y free */
  buyQty?: number;
  getQty?: number;

  /** Minimum quantity of this item required before offer activates */
  requiredQty?: number;
  /** Max times this offer may be redeemed per basket (0 = unlimited) */
  maxRedemptions?: number;

  /** If false, no other offers may apply to the same item */
  stackable: boolean;
  /** All offers sharing this group ID are mutually exclusive */
  exclusionGroup?: string;
  /** Higher priority wins when mutual exclusion is applied */
  priority?: number;

  /** ISO 8601 date string — offer is invalid after this date */
  expiresAt?: string;

  /** 'manufacturer' | 'store' | 'digital' — used for policy checks */
  couponType?: string;

  /** Rebate amount in cents — tracked separately, not deducted from line */
  rebateCents?: number;
}

// ============================================================
// BASKET ITEM
// ============================================================

export interface StackItem {
  id: string;
  name?: string;
  regularPriceCents: number;
  quantity: number;
  category?: string;
  brand?: string;
  offers: StackOffer[];
}

// ============================================================
// RESULTS
// ============================================================

export interface AppliedOffer {
  offerId: string;
  offerType: OfferType;
  description?: string;
  savingsCents: number;
  appliedToQty: number;
  runningPriceBeforeCents: number;
  runningPriceAfterCents: number;
}

export interface StackWarning {
  code: WarningCode;
  offerId?: string;
  itemId?: string;
  message: string;
}

export interface StackLineResult {
  itemId: string;
  itemName?: string;
  quantity: number;
  /** Per-unit regular (shelf) price */
  regularPriceCents: number;
  /** Per-unit price after SALE/BOGO only */
  salePriceCents: number;
  /** Per-unit price after all in-line offers */
  finalPriceCents: number;
  /** regularPriceCents × quantity */
  lineTotalRegularCents: number;
  /** finalPriceCents × quantity */
  lineTotalFinalCents: number;
  /** Savings actually deducted on this line */
  lineSavingsCents: number;
  /** Rebate tracked separately — not in lineSavingsCents */
  lineRebateCents: number;
  appliedOffers: AppliedOffer[];
  rejectedOfferIds: string[];
  warnings: StackWarning[];
}

export interface StackExplanation {
  summary: string;
  /** Offer types in the order they were applied */
  orderApplied: OfferType[];
  lineBreakdown: Array<{
    itemName: string;
    regularTotal: string;  // "$4.99"
    finalTotal: string;    // "$2.49"
    savings: string;       // "$2.50"
    rebate?: string;       // "$1.00"
  }>;
}

export interface StackResult {
  basketId: string;
  retailerKey: string;
  lines: StackLineResult[];
  basketRegularCents: number;
  basketFinalCents: number;
  /** Total saved in-stack (does not include rebates) */
  totalSavingsCents: number;
  inStackSavingsCents: number;
  /** Total rebates (tracked separately, paid later) */
  rebateCents: number;
  appliedOffers: AppliedOffer[];
  warnings: StackWarning[];
  rejectedOfferIds: string[];
  explanation: StackExplanation;
  computedAt: string;
  modelVersion: string;
}

// ============================================================
// POLICY
// ============================================================

export interface RetailerPolicy {
  retailerKey: string;
  maxStackItems: number;
  allowedCouponTypes: string[];
  maxTotalCouponValueCents: number;
  maxManufacturerCoupons: number;
  maxStoreCoupons: number;
  roundingMode: RoundingMode;
  // Stacking rules (from retailer_rules table)
  blockSaleAndDigital: boolean;
  blockSaleAndLoyalty: boolean;
  blockBogoAndCoupon: boolean;
  blockCouponAndLoyalty: boolean;
}

export const DEFAULT_POLICY: RetailerPolicy = {
  retailerKey: 'default',
  maxStackItems: 10,
  allowedCouponTypes: ['manufacturer', 'store', 'digital'],
  maxTotalCouponValueCents: 99_999,
  maxManufacturerCoupons: 1,
  maxStoreCoupons: 1,
  roundingMode: 'floor',
  blockSaleAndDigital: false,
  blockSaleAndLoyalty: false,
  blockBogoAndCoupon: false,
  blockCouponAndLoyalty: false,
};

// ============================================================
// VALIDATION
// ============================================================

export interface ValidationResult {
  /** Items with invalid offers stripped out / replaced */
  validItems: StackItem[];
  /** Offer IDs that were rejected across all items */
  rejectedOfferIds: string[];
  warnings: StackWarning[];
}

// ============================================================
// ENGINE CONFIG
// ============================================================

export interface StackEngineConfig {
  /** Persist the result to stack_results table */
  persistResults?: boolean;
  modelVersion?: string;
  /** Required if persistResults = true */
  userId?: string;
}
