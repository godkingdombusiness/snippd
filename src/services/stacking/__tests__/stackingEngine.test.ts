/**
 * Stacking Engine — Integration Tests
 *
 * Run with:
 *   npx ts-node --project tsconfig.test.json src/services/stacking/__tests__/stackingEngine.test.ts
 *
 * No Jest, no Supabase — pure ts-node with a built-in test runner.
 * Tests cover stackValidator + stackCalculator (the pure-function core).
 */

import { validateOfferSet } from '../stackValidator';
import { calculateStackLine } from '../stackCalculator';
import {
  RetailerPolicy,
  StackItem,
  StackOffer,
  DEFAULT_POLICY,
} from '../../../types/stacking';

// ─────────────────────────────────────────────────────────────
// Minimal test runner
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}\n  expected: ${e}\n  received: ${a}`);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// Test policy factories
// ─────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<RetailerPolicy> = {}): RetailerPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

const PUBLIX_POLICY = makePolicy({
  retailerKey:      'publix',
  blockBogoAndCoupon: true,
  blockSaleAndDigital: false,
});

const KROGER_POLICY = makePolicy({
  retailerKey:      'kroger',
  blockBogoAndCoupon: false,
});

const WALMART_POLICY = makePolicy({
  retailerKey:         'walmart',
  blockSaleAndDigital: true,
  // Walmart allows digital coupons on their own, but not combined with a SALE
  allowedCouponTypes:  ['manufacturer', 'store', 'digital'],
});

// ─────────────────────────────────────────────────────────────
// Offer factories
// ─────────────────────────────────────────────────────────────

function saleOffer(discountPct: number, id = 'sale-1'): StackOffer {
  return { id, offerType: 'SALE', discountPct, stackable: true };
}

function bogoOffer(id = 'bogo-1', bogoModel: StackOffer['bogoModel'] = 'second_free'): StackOffer {
  return { id, offerType: 'BOGO', bogoModel, stackable: true };
}

function mfrCoupon(discountCents: number, id = 'mfr-1'): StackOffer {
  return { id, offerType: 'MANUFACTURER_COUPON', discountCents, couponType: 'manufacturer', stackable: true };
}

function storeCoupon(discountCents: number, id = 'store-1'): StackOffer {
  return { id, offerType: 'STORE_COUPON', discountCents, couponType: 'store', stackable: true };
}

function digitalCoupon(discountCents: number, id = 'dig-1'): StackOffer {
  return { id, offerType: 'DIGITAL_COUPON', discountCents, couponType: 'digital', stackable: true };
}

function loyaltyPrice(finalPriceCents: number, id = 'loyal-1'): StackOffer {
  return { id, offerType: 'LOYALTY_PRICE', finalPriceCents, stackable: true };
}

function rebateOffer(rebateCents: number, id = 'rebate-1'): StackOffer {
  return { id, offerType: 'REBATE', rebateCents, stackable: true };
}

function expiredOffer(id = 'expired-1'): StackOffer {
  return { id, offerType: 'SALE', discountPct: 0.5, stackable: true, expiresAt: '2020-01-01T00:00:00.000Z' };
}

function item(regularPriceCents: number, quantity: number, offers: StackOffer[], id = 'item-1'): StackItem {
  return { id, name: `Item ${id}`, regularPriceCents, quantity, offers };
}

// ─────────────────────────────────────────────────────────────
// VALIDATION TESTS
// ─────────────────────────────────────────────────────────────

console.log('\n── Validator Tests ──────────────────────────────────────');

test('1. Expired offer rejection', () => {
  const i = item(500, 1, [expiredOffer()]);
  const { validItems, rejectedOfferIds, warnings } = validateOfferSet([i], DEFAULT_POLICY);
  assert(rejectedOfferIds.includes('expired-1'), 'expired offer should be in rejectedOfferIds');
  assert(validItems[0].offers.length === 0, 'valid item should have no offers');
  assert(warnings.some((w) => w.code === 'OFFER_EXPIRED'), 'should have OFFER_EXPIRED warning');
});

test('2. Non-stackable offer rejection (second non-stackable removed)', () => {
  const offers: StackOffer[] = [
    { id: 'ns-1', offerType: 'SALE', discountPct: 0.2, stackable: false },
    { id: 'ns-2', offerType: 'SALE', discountPct: 0.1, stackable: false },
  ];
  const i = item(1000, 1, offers);
  const { validItems, rejectedOfferIds, warnings } = validateOfferSet([i], DEFAULT_POLICY);
  assert(rejectedOfferIds.includes('ns-2'), 'second non-stackable should be rejected');
  assert(!rejectedOfferIds.includes('ns-1'), 'first non-stackable should be kept');
  assert(warnings.some((w) => w.code === 'NON_STACKABLE'), 'should have NON_STACKABLE warning');
  assert(validItems[0].offers.length === 1, 'should keep exactly 1 non-stackable');
});

test('3. Mutual exclusion group — keeps higher priority', () => {
  const offers: StackOffer[] = [
    { id: 'ex-low',  offerType: 'SALE', discountPct: 0.3, stackable: true, exclusionGroup: 'promo', priority: 5  },
    { id: 'ex-high', offerType: 'SALE', discountPct: 0.2, stackable: true, exclusionGroup: 'promo', priority: 10 },
  ];
  const i = item(1000, 1, offers);
  const { validItems, rejectedOfferIds } = validateOfferSet([i], DEFAULT_POLICY);
  assert(rejectedOfferIds.includes('ex-low'),  'lower priority offer should be rejected');
  assert(!rejectedOfferIds.includes('ex-high'), 'higher priority offer should be kept');
  assert(validItems[0].offers.length === 1, 'only 1 offer should remain');
  assertEqual(validItems[0].offers[0].id, 'ex-high', 'kept offer id');
});

test('4. sale + digital coupon blocked when policy forbids (Walmart)', () => {
  const offers: StackOffer[] = [
    saleOffer(0.2, 'sale-1'),
    digitalCoupon(50, 'dig-1'),
  ];
  const i = item(500, 1, offers);
  const { rejectedOfferIds, warnings } = validateOfferSet([i], WALMART_POLICY);
  assert(rejectedOfferIds.includes('dig-1'), 'digital coupon should be rejected');
  assert(warnings.some((w) => w.code === 'SALE_DIGITAL_BLOCKED'), 'should have SALE_DIGITAL_BLOCKED warning');
});

test('5a. BOGO + coupon blocked for Publix', () => {
  const offers: StackOffer[] = [
    bogoOffer('bogo-1'),
    mfrCoupon(100, 'mfr-1'),
  ];
  const i = item(400, 2, offers);
  const { rejectedOfferIds } = validateOfferSet([i], PUBLIX_POLICY);
  assert(rejectedOfferIds.includes('mfr-1'), 'manufacturer coupon should be rejected at Publix with BOGO');
});

test('5b. BOGO + coupon allowed for Kroger', () => {
  const offers: StackOffer[] = [
    bogoOffer('bogo-1'),
    mfrCoupon(100, 'mfr-1'),
  ];
  const i = item(400, 2, offers);
  const { rejectedOfferIds } = validateOfferSet([i], KROGER_POLICY);
  assert(!rejectedOfferIds.includes('mfr-1'), 'manufacturer coupon should be allowed at Kroger with BOGO');
});

test('6. Manufacturer coupon limit — keeps highest value', () => {
  const offers: StackOffer[] = [
    mfrCoupon(50,  'mfr-low'),
    mfrCoupon(150, 'mfr-high'),
  ];
  const policy = makePolicy({ maxManufacturerCoupons: 1 });
  const i = item(500, 1, offers);
  const { rejectedOfferIds, validItems } = validateOfferSet([i], policy);
  assert(rejectedOfferIds.includes('mfr-low'),   'lower-value mfr coupon should be rejected');
  assert(!rejectedOfferIds.includes('mfr-high'), 'higher-value mfr coupon should be kept');
  assert(validItems[0].offers.some((o) => o.id === 'mfr-high'), 'high-value coupon present');
});

test('7. Quantity requirement enforcement', () => {
  const offers: StackOffer[] = [
    { id: 'qty-offer', offerType: 'BOGO', stackable: true, requiredQty: 4 },
  ];
  const i = item(500, 2, offers); // only qty=2, requirement is 4
  const { rejectedOfferIds, warnings } = validateOfferSet([i], DEFAULT_POLICY);
  assert(rejectedOfferIds.includes('qty-offer'), 'offer requiring qty 4 should be rejected when qty=2');
  assert(warnings.some((w) => w.code === 'QUANTITY_REQUIRED'), 'should have QUANTITY_REQUIRED warning');
});

// ─────────────────────────────────────────────────────────────
// CALCULATION TESTS
// ─────────────────────────────────────────────────────────────

console.log('\n── Calculator Tests ─────────────────────────────────────');

test('8. Sale price calculation — 20% off $5.00 = $4.00', () => {
  const i = item(500, 1, [saleOffer(0.2)]);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  assertEqual(result.finalPriceCents, 400, 'final price cents');
  assertEqual(result.lineSavingsCents, 100, 'line savings cents');
});

test('9. Sale + digital coupon — sale applied first, coupon to sale price', () => {
  // $5.00 item, 20% sale → $4.00, then $0.50 digital coupon → $3.50
  const offers: StackOffer[] = [
    saleOffer(0.2, 'sale-1'),
    digitalCoupon(50, 'dig-1'),
  ];
  const i = item(500, 1, offers);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  assertEqual(result.salePriceCents,  400, 'sale price (post-sale, pre-coupon)');
  assertEqual(result.finalPriceCents, 350, 'final price (post-sale + post-coupon)');
  assertEqual(result.lineSavingsCents, 150, 'total savings');

  // Verify order: SALE applied before DIGITAL_COUPON
  const saleEntry   = result.appliedOffers.find((a) => a.offerId === 'sale-1');
  const couponEntry = result.appliedOffers.find((a) => a.offerId === 'dig-1');
  assert(!!saleEntry && !!couponEntry, 'both offers applied');
  assert(
    result.appliedOffers.indexOf(saleEntry!) < result.appliedOffers.indexOf(couponEntry!),
    'SALE applied before DIGITAL_COUPON',
  );
  // Coupon saw $4.00 (post-sale) as its basis
  assertEqual(couponEntry!.runningPriceBeforeCents, 400, 'coupon runs on sale price');
});

test('10. Sale + loyalty + manufacturer — correct order and accumulation', () => {
  // $10.00 item
  // 10% SALE → $9.00
  // LOYALTY_PRICE final=$8.00 → $8.00
  // $1.00 mfr coupon → $7.00
  const offers: StackOffer[] = [
    saleOffer(0.10, 'sale-1'),
    loyaltyPrice(800, 'loyal-1'),
    mfrCoupon(100, 'mfr-1'),
  ];
  const i = item(1000, 1, offers);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  assertEqual(result.finalPriceCents, 700, 'final price');
  assertEqual(result.lineSavingsCents, 300, 'total savings');
});

test('11. Quantity scaling — $2.00 item × 3 with $0.25 coupon', () => {
  const i = item(200, 3, [mfrCoupon(25)]);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  assertEqual(result.lineTotalRegularCents, 600, 'regular line total');
  // per-unit: $2.00 - $0.25 = $1.75; total: $1.75 × 3 = $5.25
  assertEqual(result.finalPriceCents, 175, 'per-unit final price');
  assertEqual(result.lineTotalFinalCents, 525, 'line total final');
  assertEqual(result.lineSavingsCents, 75, 'line savings');
});

test('12. BOGO second_free — 50% savings on pair', () => {
  // $4.00 item × 2, second_free BOGO
  // pairs=1, paidUnits=1, perUnit = (1 * 400) / 2 = 200
  const i = item(400, 2, [bogoOffer('bogo-1', 'second_free')]);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  // per-unit effective price = $2.00; total = $4.00; savings = $4.00 (50%)
  assertEqual(result.finalPriceCents, 200, 'per-unit final after BOGO');
  assertEqual(result.lineTotalFinalCents, 400, 'line total after BOGO');
  assertEqual(result.lineSavingsCents, 400, 'BOGO saves $4.00 (50% of $8.00 regular)');
});

test('13. Coupon cannot make price go below zero', () => {
  // $1.00 item with a $5.00 coupon
  const i = item(100, 1, [mfrCoupon(500)]);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  assertEqual(result.finalPriceCents, 0, 'price should floor at 0');
  assertEqual(result.lineSavingsCents, 100, 'savings capped at item price');
  assert(result.warnings.some((w) => w.code === 'COUPON_FLOOR_APPLIED'), 'should warn about floor');
});

test('14. Rejected offers skipped in calculation', () => {
  // Validator rejects digital coupon (Walmart + SALE)
  const offers: StackOffer[] = [
    saleOffer(0.2, 'sale-1'),
    digitalCoupon(50, 'dig-1'),
  ];
  const i = item(500, 1, offers);
  const { validItems } = validateOfferSet([i], WALMART_POLICY);
  const result = calculateStackLine(validItems[0], WALMART_POLICY);
  // Only SALE applied: $5.00 × 0.8 = $4.00
  assertEqual(result.finalPriceCents, 400, 'only sale applied');
  assert(
    result.appliedOffers.every((a) => a.offerId !== 'dig-1'),
    'digital coupon not in applied offers',
  );
});

test('15. Rebate tracked separately — not deducted from line total', () => {
  // $5.00 item with a $1.00 mail-in rebate
  const i = item(500, 1, [rebateOffer(100)]);
  const result = calculateStackLine(i, DEFAULT_POLICY);
  // Line total unchanged — rebate tracked separately
  assertEqual(result.finalPriceCents,      500, 'line price unchanged by rebate');
  assertEqual(result.lineTotalFinalCents,  500, 'line total unchanged by rebate');
  assertEqual(result.lineSavingsCents,       0, 'in-stack savings = 0 (rebate not deducted)');
  assertEqual(result.lineRebateCents,      100, 'rebate tracked in lineRebateCents');
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`────────────────────────────────────────────────────────\n`);

if (failed > 0) {
  process.exit(1);
}
