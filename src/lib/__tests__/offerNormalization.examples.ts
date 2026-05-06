// FOLD 7 — Test data for the Normalized Offer Engine.
// 5 raw grocery offers with expected normalized output for manual verification.
// Run with: npx ts-node --project tsconfig.test.json src/lib/__tests__/offerNormalization.examples.ts

import { normalizeOffer, type RawOffer, type NormalizedOffer } from '../offerNormalization';
import { matchProducts } from '../productMatching';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const RAW_OFFERS: Array<{ input: RawOffer; note: string }> = [
  {
    note: 'Simple sale with regular price → savings calculable',
    input: {
      retailer: 'Kroger',
      product_name: 'Tide Pods Laundry Detergent',
      brand: 'Tide',
      category: 'Household',
      price_text: '$12.99',
      size_text: '32 ct',
      regular_price_cents: 1799,
      source_offer_id: 'kroger-tide-pods-32ct',
    },
  },
  {
    note: 'BOGO deal — no explicit price; savings from regular',
    input: {
      retailer: 'Publix',
      product_name: 'Coca-Cola Original Taste',
      brand: 'Coca-Cola',
      category: 'Beverages',
      price_text: 'Buy 1 Get 1 Free',
      size_text: '2 L',
      regular_price_cents: 249,
      source_offer_id: 'publix-coke-2l-bogo',
    },
  },
  {
    note: 'Multibuy — 3 for $5; unit price derived',
    input: {
      retailer: 'Dollar General',
      product_name: "Campbell's Chicken Noodle Soup",
      brand: "Campbell's",
      category: 'Pantry',
      price_text: '3/$5',
      size_text: '10.75 oz',
      regular_price_cents: 229,
      source_offer_id: 'dg-campbells-cnoodle-3for5',
    },
  },
  {
    note: 'Coupon — dollar-off; savings explicit in price_text',
    input: {
      retailer: 'Walgreens',
      product_name: 'Colgate Total Toothpaste',
      brand: 'Colgate',
      category: 'Health & Beauty',
      price_text: '$1.50 off',
      size_text: '5.1 oz',
      regular_price_cents: 599,
      source_offer_id: 'walgreens-colgate-total-51oz',
    },
  },
  {
    note: 'No price text — confidence should be low; no savings',
    input: {
      retailer: 'Walmart',
      product_name: 'Great Value Whole Milk',
      brand: 'Great Value',
      category: 'Dairy',
      price_text: '',
      size_text: '1 gal',
      regular_price_cents: null,
      source_offer_id: null,    // no source ID → always inserts fresh
    },
  },
];

// ── Expected outputs (approximate, for documentation) ─────────────────────────

/*
  Offer 1 — Tide Pods 32 ct, $12.99
    deal_type:              'sale'
    price_cents:            1299
    regular_price_cents:    1799
    savings_cents:          500
    final_unit_price_cents: 1299
    confidence_score:       ~0.925  (avg of price 0.95 + size 0.90)

  Offer 2 — Coke 2L BOGO
    deal_type:              'bogo'
    price_cents:            null
    quantity_required:      1
    quantity_received:      2
    final_unit_price_cents: 125   (249 / 2)
    savings_cents:          124   (249 - 125)
    confidence_score:       ~0.9

  Offer 3 — Campbell's 3/$5
    deal_type:              'multibuy'
    price_cents:            500   (total for 3)
    quantity_required:      3
    quantity_received:      3
    final_unit_price_cents: 167   (500 / 3 rounded)
    savings_cents:          62    (229 - 167)
    confidence_score:       ~0.9

  Offer 4 — Colgate coupon $1.50 off
    deal_type:              'coupon'
    price_cents:            150   (the discount)
    final_unit_price_cents: 449   (599 - 150)
    savings_cents:          150
    confidence_score:       ~0.875 (avg of price 0.85 + size 0.90)

  Offer 5 — Great Value Milk (no price)
    deal_type:              'unknown'
    price_cents:            null
    savings_cents:          null
    final_unit_price_cents: null
    confidence_score:       0     (no price text)
    source_offer_id:        null  → will always INSERT, never upsert
*/

// ── Runner ────────────────────────────────────────────────────────────────────

function run() {
  console.log('=== Normalized Offer Engine — Test Data ===\n');

  RAW_OFFERS.forEach(({ input, note }, i) => {
    const result: NormalizedOffer = normalizeOffer(input);
    console.log(`--- Offer ${i + 1}: ${note} ---`);
    console.log('  Input:  ', JSON.stringify({ product_name: input.product_name, price_text: input.price_text, size_text: input.size_text }));
    console.log('  Output: ', JSON.stringify({
      deal_type:              result.deal_type,
      price_cents:            result.price_cents,
      savings_cents:          result.savings_cents,
      final_unit_price_cents: result.final_unit_price_cents,
      confidence_score:       result.confidence_score,
    }));
    console.log();
  });

  // ── Product matching demo ─────────────────────────────────────────────────

  console.log('=== Product Matching Demo ===\n');

  const matchCases = [
    {
      a: { product_name: 'Tide Pods Laundry Detergent', brand: 'Tide', normalized_size: 32, normalized_unit: 'ct' },
      b: { product_name: 'Tide Pods Laundry Detergent', brand: 'Tide', normalized_size: 35, normalized_unit: 'ct' },
      note: 'Same product, slightly different size → should match',
    },
    {
      a: { product_name: 'Coke Original 2L',   brand: 'Coca-Cola', normalized_size: 2,  normalized_unit: 'l' },
      b: { product_name: 'Pepsi Cola 2 Liter',  brand: 'Pepsi',     normalized_size: 2,  normalized_unit: 'l' },
      note: 'Different brand, similar name → should NOT match',
    },
    {
      a: { product_name: 'Great Value 2% Milk', brand: 'Great Value', normalized_size: 1,    normalized_unit: 'gal' },
      b: { product_name: 'Great Value 2% Milk', brand: 'Great Value', normalized_size: 128,   normalized_unit: 'oz' },
      note: '1 gal vs 128 oz — cross-unit same product → should match',
    },
  ];

  matchCases.forEach(({ a, b, note }) => {
    const result = matchProducts(a, b);
    console.log(`  ${note}`);
    console.log(`  matched=${result.matched}  score=${result.match_score}  reasons=${result.reasons.join(', ')}`);
    console.log();
  });
}

if (require.main === module) run();

export { RAW_OFFERS, run };
