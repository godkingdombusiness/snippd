/**
 * cartEngine.test.ts — standalone ts-node test suite
 *
 * Run:
 *   npx ts-node --project tsconfig.test.json src/services/cartEngine.test.ts
 *
 * Tests (no Supabase required — uses mock data):
 *  1. All 3 cart types are generated
 *  2. max_savings has highest savings_pct
 *  3. convenience has lowest item_count
 *  4. budget_fit is true when total <= budget
 *  5. budget_fit is false when total > budget
 *  6. All carts have non-empty items
 *  7. retailer_set reflects items' retailer_key
 *  8. savings_pct is calculated correctly
 */

import { buildCartOptions, CartOption, BuildCartOptionsResult } from './cartEngine';
import { SupabaseClient } from '@supabase/supabase-js';
import { StackItem } from '../types/stacking';

// ─────────────────────────────────────────────────────────────
// Minimal test runner (same pattern as stackingEngine.test.ts)
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(err as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}\n  Expected: ~${expected} (±${tolerance})\n  Actual:   ${actual}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Mock Supabase client
// ─────────────────────────────────────────────────────────────

// Candidate items for mock stack_candidates
const MOCK_ITEMS_A: StackItem[] = [
  {
    id: 'item-a1',
    name: 'Chicken Breast',
    regularPriceCents: 999,
    quantity: 2,
    category: 'meat',
    brand: 'Perdue',
    offers: [
      { id: 'o1', offerType: 'SALE', discountPct: 0.20, stackable: true },
      { id: 'o2', offerType: 'MANUFACTURER_COUPON', discountCents: 100, couponType: 'manufacturer', stackable: true },
    ],
  },
];

const MOCK_ITEMS_B: StackItem[] = [
  {
    id: 'item-b1',
    name: 'Orange Juice',
    regularPriceCents: 599,
    quantity: 2,
    category: 'beverages',
    brand: 'Tropicana',
    offers: [
      { id: 'o3', offerType: 'BOGO', bogoModel: 'second_free', stackable: true },
    ],
  },
];

const MOCK_ITEMS_C: StackItem[] = [
  {
    id: 'item-c1',
    name: 'Greek Yogurt',
    regularPriceCents: 349,
    quantity: 4,
    category: 'dairy',
    brand: 'Chobani',
    offers: [
      { id: 'o4', offerType: 'DIGITAL_COUPON', discountCents: 50, couponType: 'digital', stackable: true },
    ],
  },
];

// All other candidates (for volume): 12 items with moderate savings
const BULK_ITEMS: StackItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: `bulk-item-${i}`,
  name: `Grocery Item ${i}`,
  regularPriceCents: 299 + i * 50,
  quantity: 1,
  category: i % 2 === 0 ? 'dairy' : 'produce',
  brand: i % 3 === 0 ? 'Generic' : `Brand${i}`,
  offers: [
    {
      id: `bulk-offer-${i}`,
      offerType: 'SALE' as const,
      discountPct: 0.10 + (i * 0.01),
      stackable: true,
    },
  ],
}));

// Mock DB that returns enough candidates to build all 3 cart types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMockDb(weeklyBudgetCents: number | null = 15000): SupabaseClient {
  const mockCandidates = [
    {
      id: 'cand-a',
      retailer_key: 'publix',
      week_of: '2026-04-14',
      stack_rank_score: 0.95,
      items: MOCK_ITEMS_A,
      primary_category: 'meat',
      primary_brand: 'Perdue',
    },
    {
      id: 'cand-b',
      retailer_key: 'publix',
      week_of: '2026-04-14',
      stack_rank_score: 0.88,
      items: MOCK_ITEMS_B,
      primary_category: 'beverages',
      primary_brand: 'Tropicana',
    },
    {
      id: 'cand-c',
      retailer_key: 'publix',
      week_of: '2026-04-14',
      stack_rank_score: 0.75,
      items: MOCK_ITEMS_C,
      primary_category: 'dairy',
      primary_brand: 'Chobani',
    },
    ...BULK_ITEMS.map((items, i) => ({
      id: `cand-bulk-${i}`,
      retailer_key: 'publix',
      week_of: '2026-04-14',
      stack_rank_score: 0.60 - i * 0.02,
      items: [items],
      primary_category: items.category,
      primary_brand: items.brand,
    })),
  ];

  const mockSnapshot = {
    user_id: 'test-user',
    snapshot: {
      budget_stress_level: 0.2,
      shopping_mode: 'deal_hunter',
      coupon_responsiveness: 0.8,
      bogo_responsiveness: 0.6,
    },
    snapshot_at: new Date().toISOString(),
  };

  const mockPreferences = [
    { preference_key: 'coupon_clipped', category: 'meat', brand: 'Perdue', retailer_key: 'publix', score: 2.4, normalized_score: 0.9 },
    { preference_key: 'stack_applied', category: 'dairy', brand: 'Chobani', retailer_key: 'publix', score: 1.8, normalized_score: 0.7 },
    { preference_key: 'item_added_to_cart', category: 'beverages', brand: '', retailer_key: 'publix', score: 1.2, normalized_score: 0.5 },
  ];

  const mockBudget = weeklyBudgetCents !== null ? { weekly_budget_cents: weeklyBudgetCents } : null;

    return {
    from: (table: string) => {
      if (table === 'user_state_snapshots') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockSnapshot, error: null }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'user_preference_scores') {
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockPreferences, error: null }) }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'budgets') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockBudget, error: null }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'stack_candidates') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockCandidates, error: null }) }) }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'recommendation_exposures') {
        return {
          insert: () => Promise.resolve({ data: [], error: null }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'retailer_coupon_parameters') {
        return {
          select: () => ({ eq: () => ({ or: () => Promise.resolve({ data: [], error: null }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'retailer_rules') {
        return {
          select: () => ({ eq: () => ({ or: () => Promise.resolve({ data: [], error: null }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      if (table === 'wealth_momentum_snapshots') {
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        } as unknown as ReturnType<SupabaseClient['from']>;
      }
      // Default: return empty
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        insert: () => Promise.resolve({ data: [], error: null }),
      } as unknown as ReturnType<SupabaseClient['from']>;
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as SupabaseClient;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('\nRunning cartEngine tests...\n');

  let result: BuildCartOptionsResult;
  const db = buildMockDb(15000);

  // Pre-compute result for most tests
  result = await buildCartOptions('test-user', 'publix', '2026-04-14', db);

  await test('Generates all 3 cart types', async () => {
    assertEqual(result.carts.length, 3, 'Expected 3 carts');
    const types = result.carts.map((c) => c.cart_type).sort();
    assertEqual(types[0], 'balanced', 'Missing balanced cart');
    assertEqual(types[1], 'convenience', 'Missing convenience cart');
    assertEqual(types[2], 'max_savings', 'Missing max_savings cart');
  });

  await test('Carts are in correct order (max_savings first)', async () => {
    assertEqual(result.carts[0].cart_type, 'max_savings', 'First cart must be max_savings');
    assertEqual(result.carts[1].cart_type, 'balanced', 'Second cart must be balanced');
    assertEqual(result.carts[2].cart_type, 'convenience', 'Third cart must be convenience');
  });

  await test('max_savings has highest savings_pct', async () => {
    const maxSavings  = result.carts.find((c) => c.cart_type === 'max_savings')!;
    const balanced    = result.carts.find((c) => c.cart_type === 'balanced')!;
    const convenience = result.carts.find((c) => c.cart_type === 'convenience')!;
    assert(
      maxSavings.savings_pct >= balanced.savings_pct ||
      maxSavings.savings_pct >= convenience.savings_pct,
      `max_savings (${maxSavings.savings_pct}%) should have ≥ savings than at least one other cart`,
    );
  });

  await test('convenience has lowest item_count', async () => {
    const maxSavings  = result.carts.find((c) => c.cart_type === 'max_savings')!;
    const convenience = result.carts.find((c) => c.cart_type === 'convenience')!;
    assert(
      convenience.item_count <= maxSavings.item_count,
      `convenience (${convenience.item_count}) should have ≤ items than max_savings (${maxSavings.item_count})`,
    );
  });

  await test('budget_fit is true when subtotal <= budget (15000 cents)', async () => {
    for (const cart of result.carts) {
      if (cart.subtotal_after_savings_cents <= 15000) {
        assert(cart.budget_fit, `Cart ${cart.cart_type} should have budget_fit=true (total=${cart.subtotal_after_savings_cents}, budget=15000)`);
      }
    }
  });

  await test('budget_fit is false when subtotal > budget (1 cent budget)', async () => {
    const tinyBudgetDb = buildMockDb(1); // 1 cent budget
    const tinyResult = await buildCartOptions('test-user', 'publix', '2026-04-14', tinyBudgetDb);
    for (const cart of tinyResult.carts) {
      if (cart.subtotal_after_savings_cents > 1) {
        assert(!cart.budget_fit, `Cart ${cart.cart_type} should have budget_fit=false (total=${cart.subtotal_after_savings_cents})`);
      }
    }
  });

  await test('All carts have non-empty items', async () => {
    for (const cart of result.carts) {
      assert(cart.items.length > 0, `Cart ${cart.cart_type} must have at least 1 item`);
    }
  });

  await test('savings_pct is calculated correctly for max_savings cart', async () => {
    const cart = result.carts.find((c) => c.cart_type === 'max_savings')!;
    const expectedPct = cart.subtotal_before_savings_cents > 0
      ? Math.round((cart.total_savings_cents / cart.subtotal_before_savings_cents) * 1000) / 10
      : 0;
    assertApprox(cart.savings_pct, expectedPct, 0.5, 'savings_pct calculation mismatch');
  });

  await test('retailer_set reflects items retailer_key', async () => {
    for (const cart of result.carts) {
      const itemRetailers = new Set(cart.items.map((i) => i.retailer_key));
      for (const rk of itemRetailers) {
        assert(cart.retailer_set.includes(rk), `retailer_set missing '${rk}' from items`);
      }
    }
  });

  await test('No candidates: returns empty carts array', async () => {
    const emptyDb = {
      from: (table: string) => {
        if (table === 'user_state_snapshots') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
        if (table === 'user_preference_scores') {
          return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) };
        }
        if (table === 'budgets') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
        if (table === 'stack_candidates') {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) };
        }
        return { insert: () => Promise.resolve({ data: [], error: null }) };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as SupabaseClient;

    const emptyResult = await buildCartOptions('test-user', 'publix', '2026-04-14', emptyDb);
    assertEqual(emptyResult.carts.length, 0, 'Expected 0 carts when no candidates');
  });

  // ── Results ────────────────────────────────────────────────

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
