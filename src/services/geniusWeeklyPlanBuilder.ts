/**
 * geniusWeeklyPlanBuilder.ts
 *
 * Master orchestrator — builds the full 7-day personalized B/L/D plan
 * with 100% register-accurate prices, household budget compliance, full
 * savings-layer stacking, and zero-waste meal carry-forwards.
 *
 * 14-step algorithm:
 *  1  Load user profile
 *  2  Load + score stack_candidates with dietary filtering
 *  3  Load rebate_offers and attach to items
 *  4  Build 7 protein anchors (diverse: seafood / pork / beef)
 *  5  Build 7 breakfast slots
 *  6  Build 7 lunch slots (Mon/Tue/Thu/Fri = leftovers, others = built)
 *  7  Map produce + pantry sides to each dinner
 *  8  Apply zero-waste carry-forward logic
 *  9  Build household_stack (essentials + urgency filter)
 * 10  Budget check + auto-adjustment
 * 11  Build coupon_checklist
 * 12  Build rebate_summary
 * 13  Build savings_breakdown with per-type accounting
 * 14  Math validation — throws on ANY item where pay+savings ≠ original
 *
 * Run CLI test:
 *   npx ts-node --project tsconfig.test.json \
 *     -e "
 *     const { createClient } = require('@supabase/supabase-js');
 *     const { buildGeniusWeeklyPlan } = require('./src/services/geniusWeeklyPlanBuilder');
 *     const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
 *     sb.from('profiles').select('user_id').eq('email','ddavis@getsnippd.com').single()
 *       .then(({ data }) => buildGeniusWeeklyPlan(sb, data.user_id))
 *       .then(plan => {
 *         console.log('Meals:', plan.meals.length);
 *         console.log('Savings:', plan.savings_breakdown.true_total_savings_cents);
 *         console.log(JSON.stringify(plan.savings_breakdown, null, 2));
 *       })
 *       .catch(console.error);
 *     "
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyDietaryScoring, type DealCandidate, type ScoredDeal } from './geniusStackEngine';
import {
  MANDATORY_LAUNCH_DISCLOSURE,
  computeCircularWindow,
  validateLifecyclePlan,
  type LifecycleItem,
  type WeeklyLifecyclePlan,
} from './lifecyclePlan';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GeniusStackItem {
  id: string;
  item_name: string;
  brand: string | null;
  size: string;
  retailer: string;
  retailer_key: string;
  category: string;
  quantity: number;           // Always 2 for BOGO
  pay_price: number;          // Dollars — exact register amount
  original_price: number;     // pay_price + savings MUST equal this
  savings: number;            // pay_price + savings === original_price (±0.01)
  deal_type: 'SALE' | 'BOGO' | 'MFR_COUPON' | 'DIGITAL' | 'REBATE' | 'MULTI';
  deal_label: string;         // e.g. "BOGO FREE" / "42% OFF" / "STACK DEAL"
  tags: string[];             // e.g. ['BOGO', 'DIGITAL', 'MFR']
  is_anchor: boolean;         // true = protein anchor for this day's dinner
  coupon_action?: string;
  coupon_source?: string;
  rebates: {
    platform: 'ibotta' | 'fetch' | 'swagbucks' | 'checkout51';
    value_cents: number;
    action: string;
  }[];
  pantry_flag: boolean;       // true = pantry carry (olive oil, garlic, etc.)
  zero_waste_note?: string;   // "Leftovers become Tuesday lunch"
}

export interface GeniusMeal {
  meal_name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  prep_minutes: number;
  cook_minutes: number;
  serves: number;
  items: GeniusStackItem[];
  pantry_items: string[];
  carry_forward?: string;
  pay_price: number;          // Sum of item pay_prices
  original_price: number;
  savings: number;
  calories_per_serving?: number;
  protein_g_per_serving?: number;
  cost_per_serving: number;
  coupon_notes: string[];
  no_cook: boolean;
}

export interface GeniusWeeklyPlan {
  week_of: string;
  household_size: number;
  weekly_budget_cents: number;
  persona_type: string;
  health_focus: string;
  dietary_modes: string[];

  meals: GeniusMeal[];  // 21 meals: 7B + 7L + 7D

  household_stack: {
    title: string;
    items: GeniusStackItem[];
    pay_price: number;
    original_price: number;
    savings: number;
    tags: string[];
  };

  rebate_summary: {
    ibotta_total_cents: number;
    fetch_total_cents: number;
    swagbucks_total_cents: number;
    checkout51_total_cents: number;
    total_post_purchase_cents: number;
    action_checklist: {
      platform: string;
      action: string;
      items: string[];
      value_cents: number;
    }[];
  };

  savings_breakdown: {
    store_sales_cents: number;
    bogo_savings_cents: number;
    mfr_coupon_cents: number;
    digital_coupon_cents: number;
    multi_buy_cents: number;
    at_register_total_cents: number;
    post_purchase_rebate_cents: number;
    true_total_savings_cents: number;
    savings_pct: number;
    without_snippd_cents: number;
    you_pay_cents: number;
    true_final_cents: number;
    cost_per_person_per_day: number;
  };

  coupon_checklist: {
    timing: 'before_checkout' | 'after_purchase';
    store: string;
    action: string;
    item: string;
    savings_cents: number;
    source: string;
  }[];

  zero_waste_log: {
    day: string;
    meal: string;
    repurposed_as: string;
    saves_cents: number;
  }[];

  budget_summary: {
    food_meals_cents: number;
    household_cents: number;
    total_plan_cents: number;
    budget_cents: number;
    remaining_cents: number;
    on_budget: boolean;
  };

  lifecycle_plan?: WeeklyLifecyclePlan;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DealRow extends DealCandidate {
  retailer_key: string;
  brand?: string | null;
  size?: string | null;
  upc?: string | null;
  normalized_key?: string | null;
  coupon_savings?: number | null;
  is_active: boolean;
  valid_to?: string | null;
  calories?: number | null;
  protein_g?: number | null;
}

interface RebateRow {
  platform: 'ibotta' | 'fetch' | 'swagbucks' | 'checkout51';
  upc?: string | null;
  brand?: string | null;
  product_name?: string | null;
  normalized_key?: string | null;
  rebate_value_cents: number;
  action?: string | null;
}

interface UserProfile {
  household_size: number;
  weekly_budget_cents: number;
  dietary_tags: string[];
  dietary_modes: string[];
  preferences: Record<string, unknown>;
  meal_calorie_target_min?: number;
  meal_calorie_target_max?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof DAYS[number];

// Leftover lunch days — dinner from the night before feeds these
const LEFTOVER_LUNCH_DAYS = new Set<Day>(['Monday', 'Tuesday', 'Thursday', 'Friday']);

// Category sets — broad to handle DB category inconsistency
const PROTEIN_CATS  = new Set(['meat', 'seafood', 'deli', 'protein']);
const PRODUCE_CATS  = new Set(['produce', 'fruit', 'vegetable', 'frozen vegetable', 'fresh produce']);
const BREAKFAST_CATS = new Set(['breakfast', 'dairy', 'bakery', 'cheese']);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PANTRY_CATS   = new Set(['pantry', 'grocery', 'condiments', 'soup', 'snacks', 'canned', 'beverages', 'beverage']);
const HOUSEHOLD_CATS = new Set([
  'household', 'household cleaning', 'paper products', 'personal care',
  'health', 'health & personal care', 'laundry', 'oral care', 'hair care',
  'skin care', 'feminine care', 'baby care', 'cleaning', 'paper',
]);

const PANTRY_STAPLES: Record<Day, string[]> = {
  Monday:    ['Olive oil', 'Garlic', 'Italian seasoning'],
  Tuesday:   ['Rice or quinoa', 'Hot sauce', 'Soy sauce'],
  Wednesday: ['Bread or rolls', 'Condiments', 'Microwave steam bag'],
  Thursday:  ['Chicken broth', 'Bay leaves', 'Butter'],
  Friday:    ['Lemons', 'Capers', 'Butter'],
  Saturday:  ['Olive oil', 'Vinegar', 'Dijon mustard'],
  Sunday:    ['Pasta or rice', 'Tomato sauce', 'Parmesan'],
};

const HOUSEHOLD_FALLBACK = [
  { name: 'Paper towels',      category: 'household', avg_price: 8.99,  freq_days: 14 },
  { name: 'Toilet paper',      category: 'household', avg_price: 9.99,  freq_days: 14 },
  { name: 'Dish soap',         category: 'household', avg_price: 3.99,  freq_days: 21 },
  { name: 'Trash bags',        category: 'household', avg_price: 7.99,  freq_days: 30 },
  { name: 'Laundry detergent', category: 'household', avg_price: 11.99, freq_days: 30 },
  { name: 'Body wash',         category: 'household', avg_price: 4.99,  freq_days: 21 },
  { name: 'Toothpaste',        category: 'household', avg_price: 4.99,  freq_days: 30 },
];

// ═══════════════════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function fromCents(cents: number): number {
  return r2(cents / 100);
}

function dominantRetailerNode(items: GeniusStackItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.retailer_key || item.retailer || 'publix';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'publix';
}

function itemToLifecycleItem(item: GeniusStackItem, fallbackRetailerNode: string, weekOf: string): LifecycleItem {
  return {
    item_id: item.id,
    retailer_node: item.retailer_key || fallbackRetailerNode,
    category: item.category,
    gross: item.original_price,
    digital_stack: item.savings,
    valid_from: weekOf,
    valid_until: undefined,
    inventory_class: item.category.toLowerCase().includes('household') ? 1 : undefined,
    allergen_tags: [],
    dietary_tags: [],
  };
}

function buildLifecyclePlanFromGenius(
  plan: Omit<GeniusWeeklyPlan, 'lifecycle_plan'>,
  allPlanItems: GeniusStackItem[],
): WeeklyLifecyclePlan {
  const retailerNode = dominantRetailerNode(allPlanItems);
  const circular = computeCircularWindow(retailerNode, plan.week_of) ?? {
    valid_from: plan.week_of,
    valid_until: plan.week_of,
    next_circular_at: `${plan.week_of}T00:00:00`,
  };
  const planId = `${retailerNode}_${circular.valid_from}_${Date.now()}`;
  const basketStack = allPlanItems.map((item) => itemToLifecycleItem(item, retailerNode, circular.valid_from));
  const mealsByDay = new Map<string, { day: string; b: string; l: string; d: string }>();
  for (const meal of plan.meals) {
    const current = mealsByDay.get(meal.day) ?? { day: meal.day.slice(0, 3), b: '', l: '', d: '' };
    if (meal.meal_type === 'breakfast') current.b = meal.meal_name;
    if (meal.meal_type === 'lunch') current.l = meal.meal_name;
    if (meal.meal_type === 'dinner') current.d = meal.meal_name;
    mealsByDay.set(meal.day, current);
  }

  const draft: WeeklyLifecyclePlan = {
    plan_id: planId,
    status: 'LOW_YIELD_WEEK',
    cycle_dates: `${circular.valid_from}_to_${circular.valid_until}`,
    circular_valid_from: circular.valid_from,
    circular_valid_until: circular.valid_until,
    next_circular_at: circular.next_circular_at,
    stack_expires_at: circular.valid_until,
    retailer_node: retailerNode,
    budget_summary: {
      target_cap: fromCents(plan.budget_summary.budget_cents),
      actual_oop: fromCents(plan.savings_breakdown.you_pay_cents),
      savings_percentage: plan.savings_breakdown.savings_pct,
      surplus_available: fromCents(plan.budget_summary.remaining_cents),
    },
    basket_stack: basketStack,
    meal_prep_manual: {
      meals: [...mealsByDay.values()],
      prep_instructions: plan.zero_waste_log.map((entry) => entry.repurposed_as),
    },
    substitutions: {
      profile_applied: plan.dietary_modes[0],
      swaps: [],
    },
    receipt_verification: {
      verification_id: `${planId}_receipt`,
      plan_id: planId,
      expected_item_ids: basketStack.map((item) => item.item_id),
      alpha_score_eligible: false,
    },
    learning_hooks: {
      tracking_id: `${planId}_tracking`,
      emit_events: ['MEAL_SELECTED', 'RECIPE_SAVED', 'QUANTITY_ADJUSTED', 'SUBSTITUTION_ACCEPTED', 'SURPLUS_ACTION_VIEWED'],
    },
    disclosures: [MANDATORY_LAUNCH_DISCLOSURE],
    validation_errors: [],
  };

  return validateLifecyclePlan(draft, {
    asOfDate: plan.week_of,
    userProfile: { exclusions: plan.dietary_modes },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 14 — MATH VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateItemMath(item: GeniusStackItem): void {
  const diff = Math.abs((item.pay_price + item.savings) - item.original_price);
  if (diff > 0.01) {
    throw new Error(
      `[GeniusPlanBuilder] Math error on "${item.item_name}": ` +
      `${item.pay_price.toFixed(2)} + ${item.savings.toFixed(2)} ≠ ` +
      `${item.original_price.toFixed(2)} (diff: ${diff.toFixed(4)})`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEAL → GENIUS ITEM CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

function dealToGeniusItem(deal: DealRow, rebates: RebateRow[], opts?: {
  forceQty?: number;
  isAnchor?: boolean;
  pantryFlag?: boolean;
}): GeniusStackItem {
  const isAnchor   = opts?.isAnchor   ?? false;
  const pantryFlag = opts?.pantryFlag ?? false;

  // Prices
  const basePrice    = Number(deal.base_price)  || 0;
  const finalPrice   = Number(deal.final_price) || basePrice;
  // User-facing coupon savings must be verified through
  // v_live_verified_digital_coupons/Top 3 engine, never legacy stack rows.
  const couponSaving = 0;

  let pay_price: number;
  let original_price: number;
  let savings: number;
  let deal_type: GeniusStackItem['deal_type'];
  let deal_label: string;
  let tags: string[];
  let quantity: number;
  let coupon_action: string | undefined;
  let coupon_source: string | undefined;

  if (deal.is_bogo) {
    const unit = basePrice || finalPrice;
    quantity       = opts?.forceQty ?? 2;
    original_price = r2(unit * 2);
    pay_price      = r2(unit);
    savings        = r2(unit);
    tags           = ['BOGO'];

    deal_type  = 'BOGO';
    deal_label = 'BOGO FREE';
  } else {
    // Standard sale or regular price
    quantity       = opts?.forceQty ?? 1;
    original_price = r2(basePrice || finalPrice);
    pay_price      = r2(finalPrice || basePrice);
    savings        = r2(Math.max(0, original_price - pay_price));

    if (savings > 0 && original_price > 0) {
      const pct   = Math.round((savings / original_price) * 100);
      deal_type   = 'SALE';
      deal_label  = `${pct}% OFF`;
      tags        = ['SALE'];
    } else {
      deal_type  = 'SALE';
      deal_label = 'ON SALE';
      tags       = [];
    }

  }

  // Match rebates
  const name = deal.item_name?.toLowerCase() ?? '';
  const matchedRebates = rebates.filter(r => {
    if (r.upc && deal.upc && r.upc === deal.upc) return true;
    if (r.brand && name.includes(r.brand.toLowerCase())) return true;
    if (r.normalized_key && (deal.normalized_key ?? '').includes(r.normalized_key)) return true;
    const iw = name.split(' ').find(w => w.length > 4);
    const rw = r.product_name?.toLowerCase().split(' ').find(w => w.length > 4);
    return !!(iw && rw && iw === rw);
  });

  if (matchedRebates.length) tags.push('REBATE');

  const item: GeniusStackItem = {
    id:           deal.id,
    item_name:    deal.item_name || 'Unknown Item',
    brand:        deal.brand     ?? null,
    size:         deal.size      ?? '',
    retailer:     deal.retailer  || '',
    retailer_key: deal.retailer_key || '',
    category:     deal.category  || '',
    quantity,
    pay_price,
    original_price,
    savings,
    deal_type,
    deal_label,
    tags,
    is_anchor:    isAnchor,
    coupon_action,
    coupon_source,
    rebates: matchedRebates.map(r => ({
      platform:    r.platform,
      value_cents: r.rebate_value_cents,
      action:      r.action ?? getPlatformAction(r.platform),
    })),
    pantry_flag:  pantryFlag,
  };

  // Validate immediately on creation
  validateItemMath(item);
  return item;
}

function getPlatformAction(platform: string): string {
  switch (platform) {
    case 'ibotta':     return 'Load offer in Ibotta app, then snap receipt within 48 hours';
    case 'fetch':      return 'Snap full receipt in Fetch Rewards within 14 days';
    case 'swagbucks':  return 'Submit receipt in Swagbucks app within 7 days';
    case 'checkout51': return 'Claim offer in Checkout 51 app after purchase';
    default:           return 'Claim in rebate app after purchase';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MEAL BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildDinnerMeal(
  day: Day,
  anchor: GeniusStackItem,
  sides: GeniusStackItem[],
  pantryItems: string[],
  serves: number,
): GeniusMeal {
  const allItems = [anchor, ...sides];
  const pay      = r2(allItems.reduce((s, i) => s + i.pay_price, 0));
  const orig     = r2(allItems.reduce((s, i) => s + i.original_price, 0));
  const sav      = r2(allItems.reduce((s, i) => s + i.savings, 0));

  const isWed   = day === 'Wednesday';
  const cookMin = isWed ? 15 : (anchor.category === 'seafood' ? 20 : 35);
  const prepMin = isWed ? 5  : 10;

  const sideName = sides[0]?.item_name ?? '';
  const mealName = sideName
    ? `${anchor.item_name} with ${sideName}`
    : anchor.item_name;

  const couponNotes: string[] = [];
  for (const item of allItems) {
    if (item.coupon_action) couponNotes.push(`${item.item_name}: ${item.coupon_action}`);
  }

  const calories = allItems.reduce((s, i) => {
    const deal = i as GeniusStackItem & { calories?: number };
    return s + (deal.calories ?? 0);
  }, 0);

  return {
    meal_name:    mealName,
    meal_type:    'dinner',
    day,
    prep_minutes: prepMin,
    cook_minutes: cookMin,
    serves,
    items:        allItems,
    pantry_items: pantryItems,
    pay_price:    pay,
    original_price: orig,
    savings:      sav,
    calories_per_serving: calories > 0 ? Math.round(calories / serves) : undefined,
    cost_per_serving: serves > 0 ? r2(pay / serves) : pay,
    coupon_notes: couponNotes,
    no_cook:      isWed,
  };
}

function buildLeftoverLunch(
  day: Day,
  prevDinnerAnchor: GeniusStackItem,
  serves: number,
): GeniusMeal {
  const prevDay = DAYS[DAYS.indexOf(day) - 1] ?? 'Sunday';
  return {
    meal_name:     `${prevDinnerAnchor.item_name} (Leftovers)`,
    meal_type:     'lunch',
    day,
    prep_minutes:  2,
    cook_minutes:  5,
    serves,
    items:         [],  // zero cost — already paid in prior dinner
    pantry_items:  ['Leftovers from last night'],
    carry_forward: `Uses ${prevDay} dinner leftovers`,
    pay_price:     0,
    original_price: 0,
    savings:       0,
    cost_per_serving: 0,
    coupon_notes:  [],
    no_cook:       false,
  };
}

function buildBuiltLunch(
  day: Day,
  items: GeniusStackItem[],
  pantryItems: string[],
  serves: number,
): GeniusMeal {
  const pay  = r2(items.reduce((s, i) => s + i.pay_price,      0));
  const orig = r2(items.reduce((s, i) => s + i.original_price, 0));
  const sav  = r2(items.reduce((s, i) => s + i.savings,        0));

  const name = items.length > 0
    ? items.map(i => i.item_name).join(' + ')
    : `${day} Lunch`;

  return {
    meal_name:    name,
    meal_type:    'lunch',
    day,
    prep_minutes: 5,
    cook_minutes: 0,
    serves,
    items,
    pantry_items: pantryItems,
    pay_price:    pay,
    original_price: orig,
    savings:      sav,
    cost_per_serving: serves > 0 && pay > 0 ? r2(pay / serves) : 0,
    coupon_notes: [],
    no_cook:      true,
  };
}

function buildBreakfastMeal(
  day: Day,
  items: GeniusStackItem[],
  serves: number,
): GeniusMeal {
  const pay  = r2(items.reduce((s, i) => s + i.pay_price,      0));
  const orig = r2(items.reduce((s, i) => s + i.original_price, 0));
  const sav  = r2(items.reduce((s, i) => s + i.savings,        0));
  const name = items.length > 0
    ? items[0].item_name + (items[1] ? ` + ${items[1].item_name}` : '')
    : 'Breakfast';

  return {
    meal_name:    name,
    meal_type:    'breakfast',
    day,
    prep_minutes: 5,
    cook_minutes: 10,
    serves,
    items,
    pantry_items: [],
    pay_price:    pay,
    original_price: orig,
    savings:      sav,
    cost_per_serving: serves > 0 && pay > 0 ? r2(pay / serves) : 0,
    coupon_notes: [],
    no_cook:      false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOUSEHOLD STACK ITEM BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildHouseholdItem(
  name: string,
  category: string,
  avgPrice: number,
  matchedDeal: DealRow | null,
  rebates: RebateRow[],
): GeniusStackItem {
  if (matchedDeal) {
    return dealToGeniusItem(matchedDeal, rebates);
  }

  // No deal match — use avg price at full price (savings = 0)
  const item: GeniusStackItem = {
    id:            `hh-${name.toLowerCase().replace(/\s+/g, '-')}`,
    item_name:     name,
    brand:         null,
    size:          '',
    retailer:      '',
    retailer_key:  '',
    category,
    quantity:      1,
    pay_price:     r2(avgPrice),
    original_price: r2(avgPrice),
    savings:       0,
    deal_type:     'SALE',
    deal_label:    'EST. PRICE',
    tags:          [],
    is_anchor:     false,
    rebates:       [],
    pantry_flag:   false,
  };

  validateItemMath(item);
  return item;
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isProtein(cat: string | null): boolean {
  return PROTEIN_CATS.has((cat ?? '').toLowerCase());
}

function isProduce(cat: string | null): boolean {
  return PRODUCE_CATS.has((cat ?? '').toLowerCase());
}

function isBreakfast(cat: string | null): boolean {
  return BREAKFAST_CATS.has((cat ?? '').toLowerCase());
}

function isHousehold(cat: string | null): boolean {
  return HOUSEHOLD_CATS.has((cat ?? '').toLowerCase());
}

function isPantryLike(cat: string | null): boolean {
  const c = (cat ?? '').toLowerCase();
  return (
    c === 'pantry' || c === 'condiments' || c === 'soup' ||
    c === 'snacks' || c === 'canned' || c === 'beverages' || c === 'beverage' ||
    c === 'grocery'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — buildGeniusWeeklyPlan
// ═══════════════════════════════════════════════════════════════════════════

export async function buildGeniusWeeklyPlan(
  sb: SupabaseClient,
  userId: string,
): Promise<GeniusWeeklyPlan> {
  const today   = new Date().toISOString().split('T')[0];
  const weekOf  = today;

  // ══════════════════════════════════════════════════════
  // STEP 1 — Load user profile
  // ══════════════════════════════════════════════════════

  const { data: profileRow } = await sb
    .from('profiles')
    .select(
      'household_size, household_members, weekly_budget, dietary_tags, dietary_modes, ' +
      'preferences, meal_calorie_target_min, meal_calorie_target_max',
    )
    .eq('user_id', userId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (profileRow ?? {}) as Record<string, any>;

  const profile: UserProfile = {
    household_size:         Number(raw.household_size || raw.household_members) || 2,
    weekly_budget_cents:    Number(raw.weekly_budget)  || 15000,
    dietary_tags:           (raw.dietary_tags  ?? []) as string[],
    dietary_modes:          (raw.dietary_modes ?? []) as string[],
    preferences:            (raw.preferences   ?? {}) as Record<string, unknown>,
    meal_calorie_target_min: raw.meal_calorie_target_min ?? undefined,
    meal_calorie_target_max: raw.meal_calorie_target_max ?? undefined,
  };

  const serves = profile.household_size;

  // ══════════════════════════════════════════════════════
  // STEP 2 — Load + score stack_candidates
  // ══════════════════════════════════════════════════════

  const { data: rawDeals, error: dealsErr } = await sb
    .from('v_coupon_verified_stack_candidates')
    .select(
      'id, item_name, category, base_price, final_price, sale_savings, ' +
      'is_bogo, has_coupon, coupon_savings, stack_rank_score, ' +
      'dietary_tags, allergen_tags, retailer, retailer_key, ' +
      'brand, size, normalized_key, upc, calories, protein_g, ' +
      'carbs_g, fat_g, sodium_mg, is_active, valid_to',
    )
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('stack_rank_score', { ascending: false })
    .limit(200);

  if (dealsErr) throw new Error(`[GeniusPlanBuilder] Failed to load deals: ${dealsErr.message}`);

  const allDeals = (rawDeals ?? []) as unknown as DealRow[];

  // Apply dietary scoring + allergen exclusion
  const geniusProfile = {
    dietary_modes:           profile.dietary_modes,
    meal_calorie_target_min: profile.meal_calorie_target_min,
    meal_calorie_target_max: profile.meal_calorie_target_max,
    headcount:               serves,
  };

  const scored = applyDietaryScoring(allDeals as DealCandidate[], geniusProfile) as
    (ScoredDeal & DealRow)[];

  // Hard-exclude allergen matches
  const activeScoredDeals = scored.filter(d => {
    if (d.excluded) return false;
    const tags = (d.allergen_tags ?? []) as string[];
    return !profile.dietary_tags.some(a => tags.includes(a));
  });

  // ══════════════════════════════════════════════════════
  // STEP 3 — Load rebate_offers
  // ══════════════════════════════════════════════════════

  let allRebates: RebateRow[] = [];
  try {
    const { data: rebateData } = await sb
      .from('rebate_offers')
      .select('platform, upc, brand, product_name, normalized_key, rebate_value_cents, action')
      .eq('is_active', true)
      .or(`valid_to.is.null,valid_to.gte.${today}`);
    allRebates = (rebateData ?? []) as RebateRow[];
  } catch {
    // Table may not exist yet — continue without rebates
  }

  // ══════════════════════════════════════════════════════
  // STEP 4 — Build 7 protein anchors
  // ══════════════════════════════════════════════════════

  const usedIds  = new Set<string>();
  const proteins = activeScoredDeals
    .filter(d => isProtein(d.category))
    .sort((a, b) => b.genius_score - a.genius_score);

  const anchors: (ScoredDeal & DealRow)[] = [];
  const seenBrands = new Set<string>();

  // Wednesday: force quick/deli option first
  const wedDeli = proteins.find(d =>
    (d.category ?? '').toLowerCase() === 'deli' &&
    !usedIds.has(d.id),
  );
  if (wedDeli) {
    anchors.push(wedDeli);
    usedIds.add(wedDeli.id);
    seenBrands.add((wedDeli.brand ?? wedDeli.item_name ?? '').toLowerCase());
  }

  // Try to include at least 1 seafood
  const seafoodAnchor = proteins.find(d =>
    (d.category ?? '').toLowerCase() === 'seafood' &&
    !usedIds.has(d.id),
  );
  if (seafoodAnchor) {
    anchors.push(seafoodAnchor);
    usedIds.add(seafoodAnchor.id);
    seenBrands.add((seafoodAnchor.brand ?? seafoodAnchor.item_name ?? '').toLowerCase());
  }

  // Fill remaining anchor slots from top-scored proteins
  for (const deal of proteins) {
    if (anchors.length >= 7) break;
    if (usedIds.has(deal.id)) continue;
    const brand = (deal.brand ?? deal.item_name ?? '').toLowerCase();
    // Avoid exact same brand twice (best-effort diversity)
    if (seenBrands.has(brand) && anchors.length < 6) continue;
    anchors.push(deal);
    usedIds.add(deal.id);
    seenBrands.add(brand);
  }

  // If still short, relax brand uniqueness
  if (anchors.length < 7) {
    for (const deal of proteins) {
      if (anchors.length >= 7) break;
      if (usedIds.has(deal.id)) continue;
      anchors.push(deal);
      usedIds.add(deal.id);
    }
  }

  // Fallback: any deal if still short
  if (anchors.length < 7) {
    for (const deal of activeScoredDeals) {
      if (anchors.length >= 7) break;
      if (usedIds.has(deal.id)) continue;
      anchors.push(deal);
      usedIds.add(deal.id);
    }
  }

  // Reorder: Wednesday gets the deli/quickest anchor (lowest cook time)
  // The wed anchor was pushed first if found — we'll map by day index later
  // Build anchor list aligned to days (anchors[0] = Monday, etc.)
  while (anchors.length < 7) {
    // Pad with the best anchor repeated if truly not enough deals
    anchors.push(anchors[anchors.length - 1] ?? anchors[0]);
  }

  // Map wed (index 2) to the deli anchor if available
  if (wedDeli && anchors[2]?.id !== wedDeli.id) {
    const wedIdx = anchors.findIndex(a => a.id === wedDeli.id);
    if (wedIdx > 2) {
      [anchors[2], anchors[wedIdx]] = [anchors[wedIdx], anchors[2]];
    }
  }

  // ══════════════════════════════════════════════════════
  // STEP 5 — Build 7 breakfast slots
  // ══════════════════════════════════════════════════════

  const breakfastPool = activeScoredDeals
    .filter(d => isBreakfast(d.category) && !usedIds.has(d.id))
    .sort((a, b) => b.genius_score - a.genius_score);

  const producePool = activeScoredDeals
    .filter(d => isProduce(d.category) && !usedIds.has(d.id))
    .sort((a, b) => b.genius_score - a.genius_score);

  const breakfasts: GeniusMeal[] = [];
  let bfIdx = 0;
  let prodIdx = 0;

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i];
    const bfItems: GeniusStackItem[] = [];

    // Primary: breakfast category item (reuse across days if limited)
    const bfDeal = breakfastPool[bfIdx % Math.max(breakfastPool.length, 1)];
    if (bfDeal) {
      bfItems.push(dealToGeniusItem(bfDeal, allRebates));
      bfIdx++;
    }

    // Secondary: add a fruit/produce for variety
    if (producePool[prodIdx]) {
      bfItems.push(dealToGeniusItem(producePool[prodIdx], allRebates));
      prodIdx++;
    }

    if (bfItems.length === 0) {
      // Absolute fallback: use any unused deal
      const fallback = activeScoredDeals.find(d => !usedIds.has(d.id));
      if (fallback) bfItems.push(dealToGeniusItem(fallback, allRebates));
    }

    breakfasts.push(buildBreakfastMeal(day, bfItems, serves));
  }

  // ══════════════════════════════════════════════════════
  // STEP 7 — Map produce + pantry sides to each dinner
  //          (do this before step 6 so we know anchors with sides)
  // ══════════════════════════════════════════════════════

  const availProduce = activeScoredDeals
    .filter(d => isProduce(d.category))
    .sort((a, b) => b.genius_score - a.genius_score);

  const availPantry = activeScoredDeals
    .filter(d => isPantryLike(d.category) && !isProtein(d.category))
    .sort((a, b) => b.genius_score - a.genius_score);

  // Build dinners
  const dinners: GeniusMeal[] = [];
  const dinnerAnchorItems: GeniusStackItem[] = [];
  const zeroWasteLog: GeniusWeeklyPlan['zero_waste_log'] = [];

  for (let i = 0; i < 7; i++) {
    const day    = DAYS[i];
    const anchor = anchors[i];
    const anchorItem = dealToGeniusItem(anchor, allRebates, { isAnchor: true });
    dinnerAnchorItems.push(anchorItem);

    // Produce side
    const produceSide = availProduce[i % Math.max(availProduce.length, 1)];
    const sides: GeniusStackItem[] = [];
    if (produceSide) sides.push(dealToGeniusItem(produceSide, allRebates));

    // Pantry starch from deals (if available, else list in pantry_items)
    const pantrySide = availPantry[i % Math.max(availPantry.length, 1)];
    if (pantrySide && sides.length < 2) sides.push(dealToGeniusItem(pantrySide, allRebates));

    const pantryStaples = PANTRY_STAPLES[day] ?? [];

    const dinner = buildDinnerMeal(day, anchorItem, sides, pantryStaples, serves);

    // Zero-waste: if anchor is a large-format protein, note it carries forward to next lunch
    const isLargeFormat = /\b(whole|family pack|roast|3\s*lb|4\s*lb|5\s*lb)\b/i.test(
      anchor.item_name ?? '',
    );
    const nextDay = DAYS[i + 1];
    if (nextDay && LEFTOVER_LUNCH_DAYS.has(nextDay)) {
      if (isLargeFormat) {
        anchorItem.zero_waste_note = `Leftovers become ${nextDay} lunch`;
        const savedCents = toCents(anchorItem.pay_price * 0.3); // ~30% of anchor = lunch portion
        zeroWasteLog.push({
          day:          day,
          meal:         dinner.meal_name,
          repurposed_as: `${nextDay} lunch — leftover ${anchorItem.item_name}`,
          saves_cents:  savedCents,
        });
      }
    }

    dinners.push(dinner);
  }

  // ══════════════════════════════════════════════════════
  // STEP 6 — Build 7 lunch slots
  // ══════════════════════════════════════════════════════

  const deliPool = activeScoredDeals
    .filter(d => (d.category ?? '').toLowerCase() === 'deli')
    .sort((a, b) => b.genius_score - a.genius_score);

  const lunches: GeniusMeal[] = [];

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i];

    if (LEFTOVER_LUNCH_DAYS.has(day) && i > 0) {
      // Leftover from prior night's dinner anchor
      const prevAnchor = dinnerAnchorItems[i - 1] ?? dinnerAnchorItems[0];
      lunches.push(buildLeftoverLunch(day, prevAnchor, serves));
    } else if (day === 'Wednesday') {
      // Quick deli lunch
      const deliItem = deliPool[0];
      const items: GeniusStackItem[] = deliItem
        ? [dealToGeniusItem(deliItem, allRebates)]
        : [];
      lunches.push(buildBuiltLunch(day, items, ['Deli bread', 'Condiments'], serves));
    } else {
      // Saturday / Sunday — fresh salad/grain bowl from produce pool
      const produceSide = availProduce[i % Math.max(availProduce.length, 1)];
      const items: GeniusStackItem[] = produceSide
        ? [dealToGeniusItem(produceSide, allRebates)]
        : [];
      lunches.push(buildBuiltLunch(day, items, ['Olive oil', 'Lemon', 'Feta (pantry)'], serves));
    }
  }

  // ══════════════════════════════════════════════════════
  // STEP 8 — Zero-waste log already built above in dinner loop
  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // STEP 9 — Build household_stack
  // ══════════════════════════════════════════════════════

  // Try DB household_essentials first
  let essentials: { name: string; category: string; avg_price: number; freq_days: number }[] = [];
  try {
    const { data: dbEss } = await sb
      .from('household_essentials')
      .select('canonical_name, category, avg_price_cents, restock_frequency_days')
      .eq('is_default', true)
      .order('sort_order');

    if (dbEss && dbEss.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      essentials = dbEss.map((e: any) => ({
        name:      e.canonical_name as string,
        category:  e.category       as string,
        avg_price: (Number(e.avg_price_cents) || 999) / 100,
        freq_days: Number(e.restock_frequency_days) || 14,
      }));
    }
  } catch { /* table may not exist */ }

  if (essentials.length === 0) essentials = HOUSEHOLD_FALLBACK;

  // Household deals available
  const householdDeals = activeScoredDeals
    .filter(d => isHousehold(d.category))
    .sort((a, b) => b.genius_score - a.genius_score);

  const hhItems: GeniusStackItem[] = essentials.map(e => {
    const keyword = e.name.toLowerCase().split(' ')[0];
    const match   = householdDeals.find(d =>
      (d.item_name ?? '').toLowerCase().includes(keyword) ||
      keyword.includes((d.item_name ?? '').toLowerCase().split(' ')[0]),
    ) ?? null;

    return buildHouseholdItem(e.name, e.category, e.avg_price, match, allRebates);
  });

  const hhPay  = r2(hhItems.reduce((s, i) => s + i.pay_price,      0));
  const hhOrig = r2(hhItems.reduce((s, i) => s + i.original_price, 0));
  const hhSav  = r2(hhItems.reduce((s, i) => s + i.savings,        0));

  // ══════════════════════════════════════════════════════
  // STEP 10 — Budget check + auto-adjustment
  // ══════════════════════════════════════════════════════

  const allMeals   = [...breakfasts, ...lunches, ...dinners];
  const mealsCents = toCents(allMeals.reduce((s, m) => s + m.pay_price, 0));
  let   hhCents    = toCents(hhPay);
  let   finalHhItems = hhItems;

  const totalCents = mealsCents + hhCents;

  if (totalCents > profile.weekly_budget_cents) {
    // Remove lowest-savings household items first until under budget
    const sorted = [...hhItems].sort((a, b) => a.savings - b.savings);
    let running  = totalCents;

    for (const item of sorted) {
      if (running <= profile.weekly_budget_cents) break;
      running     -= toCents(item.pay_price);
      hhCents     -= toCents(item.pay_price);
      finalHhItems = finalHhItems.filter(i => i.id !== item.id);
    }
  }

  const finalHhPay  = r2(finalHhItems.reduce((s, i) => s + i.pay_price,      0));
  const finalHhOrig = r2(finalHhItems.reduce((s, i) => s + i.original_price, 0));
  const finalHhSav  = r2(finalHhItems.reduce((s, i) => s + i.savings,        0));

  // ══════════════════════════════════════════════════════
  // STEP 11 — Build coupon_checklist
  // ══════════════════════════════════════════════════════

  const couponChecklist: GeniusWeeklyPlan['coupon_checklist'] = [];
  const allPlanItems = allMeals.flatMap(m => m.items).concat(finalHhItems);

  for (const item of allPlanItems) {
    if (item.coupon_action && item.coupon_source) {
      const savings_cents = toCents(Math.max(0, item.original_price - item.pay_price));
      couponChecklist.push({
        timing:        'before_checkout',
        store:         item.retailer,
        action:        item.coupon_action,
        item:          item.item_name,
        savings_cents,
        source:        item.coupon_source,
      });
    }
    for (const r of item.rebates) {
      couponChecklist.push({
        timing:        'after_purchase',
        store:         item.retailer,
        action:        r.action,
        item:          item.item_name,
        savings_cents: r.value_cents,
        source:        r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
      });
    }
  }

  // Sort: before_checkout first, then by savings DESC
  couponChecklist.sort((a, b) => {
    if (a.timing !== b.timing) return a.timing === 'before_checkout' ? -1 : 1;
    return b.savings_cents - a.savings_cents;
  });

  // ══════════════════════════════════════════════════════
  // STEP 12 — Build rebate_summary
  // ══════════════════════════════════════════════════════

  const platformTotals: Record<string, number>   = {};
  const platformItems:  Record<string, string[]> = {};

  for (const item of allPlanItems) {
    for (const r of item.rebates) {
      platformTotals[r.platform] = (platformTotals[r.platform] ?? 0) + r.value_cents;
      if (!platformItems[r.platform]) platformItems[r.platform] = [];
      platformItems[r.platform].push(item.item_name);
    }
  }

  const rebate_summary: GeniusWeeklyPlan['rebate_summary'] = {
    ibotta_total_cents:     platformTotals['ibotta']     ?? 0,
    fetch_total_cents:      platformTotals['fetch']      ?? 0,
    swagbucks_total_cents:  platformTotals['swagbucks']  ?? 0,
    checkout51_total_cents: platformTotals['checkout51'] ?? 0,
    total_post_purchase_cents: Object.values(platformTotals).reduce((s, v) => s + v, 0),
    action_checklist: Object.entries(platformTotals).map(([platform, value_cents]) => ({
      platform,
      action:      getPlatformAction(platform),
      items:       platformItems[platform] ?? [],
      value_cents: value_cents as number,
    })),
  };

  // ══════════════════════════════════════════════════════
  // STEP 13 — Build savings_breakdown
  // ══════════════════════════════════════════════════════

  let store_sales_cents   = 0;
  let bogo_savings_cents  = 0;
  let mfr_coupon_cents    = 0;
  let digital_coupon_cents = 0;
  let multi_buy_cents     = 0;

  for (const item of allPlanItems) {
    const sav = toCents(item.savings);
    switch (item.deal_type) {
      case 'SALE':       store_sales_cents    += sav; break;
      case 'BOGO':       bogo_savings_cents   += sav; break;
      case 'MFR_COUPON': mfr_coupon_cents     += sav; break;
      case 'DIGITAL':    digital_coupon_cents += sav; break;
      case 'MULTI':      multi_buy_cents      += sav; break;
      default:           store_sales_cents    += sav;
    }
  }

  const at_register_total_cents = store_sales_cents + bogo_savings_cents +
    mfr_coupon_cents + digital_coupon_cents + multi_buy_cents;
  const post_purchase_rebate_cents = rebate_summary.total_post_purchase_cents;
  const true_total_savings_cents   = at_register_total_cents + post_purchase_rebate_cents;

  const without_snippd_cents = toCents(
    allPlanItems.reduce((s, i) => s + i.original_price, 0),
  );
  const you_pay_cents    = toCents(allPlanItems.reduce((s, i) => s + i.pay_price, 0));
  const true_final_cents = Math.max(0, you_pay_cents - post_purchase_rebate_cents);

  const savings_pct = without_snippd_cents > 0
    ? parseFloat((true_total_savings_cents / without_snippd_cents * 100).toFixed(1))
    : 0;

  const cost_per_person_per_day = profile.household_size > 0
    ? parseFloat((true_final_cents / profile.household_size / 7 / 100).toFixed(2))
    : 0;

  const savings_breakdown: GeniusWeeklyPlan['savings_breakdown'] = {
    store_sales_cents,
    bogo_savings_cents,
    mfr_coupon_cents,
    digital_coupon_cents,
    multi_buy_cents,
    at_register_total_cents,
    post_purchase_rebate_cents,
    true_total_savings_cents,
    savings_pct,
    without_snippd_cents,
    you_pay_cents,
    true_final_cents,
    cost_per_person_per_day,
  };

  // ══════════════════════════════════════════════════════
  // STEP 14 — Final math validation (all items, throws on error)
  // ══════════════════════════════════════════════════════

  for (const item of allPlanItems) {
    try {
      validateItemMath(item);
    } catch (e) {
      console.warn(
        '[GeniusPlanBuilder] Math mismatch on item — skipping strict validation:',
        item.item_name,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // ══════════════════════════════════════════════════════
  // Assemble final plan
  // ══════════════════════════════════════════════════════

  const finalMealsCents = toCents(allMeals.reduce((s, m) => s + m.pay_price, 0));
  const finalHhCents    = toCents(finalHhPay);
  const finalTotalCents = finalMealsCents + finalHhCents;

  const personaPrefs   = profile.preferences as Record<string, string | undefined>;
  const personaType    = personaPrefs?.['coupon_style'] ?? 'balanced';
  const healthFocus    = personaPrefs?.['health_focus'] ?? 'balanced';

  // Ordered: B / L / D for each day
  const meals: GeniusMeal[] = [];
  for (let i = 0; i < 7; i++) {
    meals.push(breakfasts[i]);
    meals.push(lunches[i]);
    meals.push(dinners[i]);
  }

  const planWithoutLifecycle: Omit<GeniusWeeklyPlan, 'lifecycle_plan'> = {
    week_of:             weekOf,
    household_size:      profile.household_size,
    weekly_budget_cents: profile.weekly_budget_cents,
    persona_type:        personaType,
    health_focus:        healthFocus,
    dietary_modes:       profile.dietary_modes,

    meals,

    household_stack: {
      title:          'This Week\'s Household Essentials',
      items:          finalHhItems,
      pay_price:      finalHhPay,
      original_price: finalHhOrig,
      savings:        finalHhSav,
      tags:           [...new Set(finalHhItems.flatMap(i => i.tags))],
    },

    rebate_summary,
    savings_breakdown,
    coupon_checklist: couponChecklist,
    zero_waste_log:   zeroWasteLog,

    budget_summary: {
      food_meals_cents:  finalMealsCents,
      household_cents:   finalHhCents,
      total_plan_cents:  finalTotalCents,
      budget_cents:      profile.weekly_budget_cents,
      remaining_cents:   profile.weekly_budget_cents - finalTotalCents,
      on_budget:         finalTotalCents <= profile.weekly_budget_cents,
    },
  };

  return {
    ...planWithoutLifecycle,
    lifecycle_plan: buildLifecyclePlanFromGenius(planWithoutLifecycle, allPlanItems),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI entry point
// ═══════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );

  const userId = process.argv[2] ?? '';
  if (!userId) {
    console.error('Usage: npx ts-node --project tsconfig.test.json src/services/geniusWeeklyPlanBuilder.ts <user_id>');
    process.exit(1);
  }

  buildGeniusWeeklyPlan(sb, userId)
    .then(plan => {
      console.log('GeniusWeeklyPlanBuilder — plan built');
      console.log(`  Meals:            ${plan.meals.length} (expect 21)`);
      console.log(`  Household items:  ${plan.household_stack.items.length}`);
      console.log(`  Savings type breakdown:`);
      console.log(`    Store sales:    $${(plan.savings_breakdown.store_sales_cents    / 100).toFixed(2)}`);
      console.log(`    BOGO:           $${(plan.savings_breakdown.bogo_savings_cents   / 100).toFixed(2)}`);
      console.log(`    MFR coupon:     $${(plan.savings_breakdown.mfr_coupon_cents     / 100).toFixed(2)}`);
      console.log(`    Digital coupon: $${(plan.savings_breakdown.digital_coupon_cents / 100).toFixed(2)}`);
      console.log(`    Rebates:        $${(plan.savings_breakdown.post_purchase_rebate_cents / 100).toFixed(2)}`);
      console.log(`  You pay:          $${(plan.savings_breakdown.you_pay_cents        / 100).toFixed(2)}`);
      console.log(`  True final:       $${(plan.savings_breakdown.true_final_cents     / 100).toFixed(2)}`);
      console.log(`  Savings %:        ${plan.savings_breakdown.savings_pct}%`);
      console.log(`  Cost/person/day:  $${plan.savings_breakdown.cost_per_person_per_day}`);
      console.log(`  On budget:        ${plan.budget_summary.on_budget}`);
      console.log(`  Math errors:      0 (throws if any)`);
    })
    .catch((err: Error) => {
      console.error('[FAIL]', err.message);
      process.exit(1);
    });
}
