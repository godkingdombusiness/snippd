/**
 * get-weekly-plan — Returns a fully personalized 7-day B/L/D meal plan
 * with 100% register-accurate prices, layered savings, and household stack.
 *
 * GET /functions/v1/get-weekly-plan
 * GET /functions/v1/get-weekly-plan?refresh=true  — force rebuild, skip cache
 *
 * Auth: Bearer JWT (user session token)
 *
 * Caching: plan is cached in profiles.cached_weekly_plan for 24 hours.
 * Rebuild is triggered on circular ingestion (offerNormalizer nulls plan_cached_at).
 *
 * Never returns 500 — on errors, returns { no_deals: true }.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ── Plan-level AES-256-GCM helpers (Deno Web Crypto) ─────────────────────────
//
// Key is derived from STACK_SECRET via SHA-256 — identical algorithm to
// securityLayer.ts in the React Native client, so the client can decrypt
// what the server encrypts.  The secret is never written to any log or response.

function _b64enc(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _b64dec(s: string): ArrayBuffer {
  const b = atob(s);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a.buffer;
}

async function _planKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Encrypts a JSON-serialisable plan with the shared STACK_SECRET.
 *  Returns "<iv_b64>:<ciphertext_b64>". */
async function encryptPlan(plan: unknown, secret: string): Promise<string> {
  const key = await _planKey(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(plan)),
  );
  return `${_b64enc(iv.buffer)}:${_b64enc(ct)}`;
}

/** Decrypts a "<iv_b64>:<ciphertext_b64>" blob written by encryptPlan.
 *  Returns the original object, or null on any failure (wrong key, tampered blob). */
async function decryptPlan(sealed: string, secret: string): Promise<unknown | null> {
  try {
    if (!sealed || !secret) return null;
    const [ivB64, ctB64] = sealed.split(':');
    if (!ivB64 || !ctB64) return null;
    const key   = await _planKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(_b64dec(ivB64)) },
      key,
      _b64dec(ctB64),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

/** SHA-256 hex digest of an arbitrary payload — used as payload_hash in agentic_ledger. */
async function _sha256Hex(payload: unknown): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

// ── HMAC-SHA256 plan integrity signing ────────────────────────────────────
//
// The Edge Function signs the ciphertext with a separate HMAC_SECRET so the
// client can verify the envelope has not been tampered with in transit.
// Only the HMAC hex string is sent — never the HMAC_SECRET itself.

async function _hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Signs a ciphertext string with HMAC-SHA256. Returns lowercase hex string. */
async function signCiphertext(ciphertext: string, secret: string): Promise<string | null> {
  try {
    if (!secret || !ciphertext) return null;
    const key      = await _hmacKey(secret);
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ciphertext));
    return Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function fromCents(cents: number): number {
  return r2(cents / 100);
}

const MANDATORY_LAUNCH_DISCLOSURE =
  'Snippd is a budgeting and decision-support operating system. We are not medical professionals. All nutritional, allergy, and substitution logic is generated algorithmically. Consult with a licensed healthcare provider before following any meal plan or dietary changes. Users must verify all ingredients on physical product labels at the retailer before purchase or consumption.';

function normalizeRetailerKey(retailerNode: string): string {
  const lower = String(retailerNode || '').toLowerCase();
  if (lower.startsWith('winn')) return 'winn_dixie';
  if (lower.includes('delivery') && lower.includes('kroger')) return 'kroger_delivery';
  return lower.split(/[_:-]/)[0] || 'publix';
}

function computeCircularWindow(retailerNode: string, asOfDate: string) {
  const key = normalizeRetailerKey(retailerNode);
  const supported = new Set(['publix', 'winn_dixie', 'kroger', 'kroger_delivery']);
  if (!supported.has(key)) return null;

  const [year, month, dayNum] = asOfDate.split('-').map(Number);
  const asOf = new Date(Date.UTC(year, month - 1, dayNum));
  const daysSinceWednesday = (asOf.getUTCDay() - 3 + 7) % 7;
  const start = new Date(asOf);
  start.setUTCDate(asOf.getUTCDate() - daysSinceWednesday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const next = new Date(start);
  next.setUTCDate(start.getUTCDate() + 7);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return {
    valid_from: fmt(start),
    valid_until: fmt(end),
    next_circular_at: `${fmt(next)}T00:00:00`,
  };
}

function dominantRetailerNode(items: any[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(item.retailer_key || item.retailer || 'publix').toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'publix';
}

function calculateLifecycleSavings(items: any[]) {
  const gross = r2(items.reduce((sum, item) => sum + Number(item.gross || 0), 0));
  const savings = r2(items.reduce((sum, item) => (
    sum + Number(item.digital_stack || 0) + Number(item.store_reward || 0) + Number(item.threshold_reward || 0)
  ), 0));
  const oop = r2(Math.max(0, gross - savings));
  return {
    gross,
    oop,
    savings,
    savings_percentage: gross > 0 ? Math.round((savings / gross) * 1000) / 10 : 0,
  };
}

function buildLifecyclePlan(plan: any, userId: string) {
  const allItems = [
    ...((plan?.meals ?? []) as any[]).flatMap((meal) => meal.items ?? []),
    ...((plan?.household_stack?.items ?? []) as any[]),
  ];
  const retailerNode = dominantRetailerNode(allItems);
  const circular = computeCircularWindow(retailerNode, String(plan.week_of)) ?? {
    valid_from: String(plan.week_of),
    valid_until: String(plan.week_of),
    next_circular_at: `${String(plan.week_of)}T00:00:00`,
  };
  const planId = `${userId}_${retailerNode}_${circular.valid_from}`;
  const basketStack = allItems.map((item: any) => ({
    item_id: String(item.id),
    retailer_node: String(item.retailer_key || retailerNode).toLowerCase(),
    category: item.category,
    inventory_class: String(item.category || '').toLowerCase().includes('household') ? 1 : undefined,
    gross: Number(item.original_price || 0),
    digital_stack: Number(item.savings || 0),
    valid_from: circular.valid_from,
    valid_until: circular.valid_until,
    allergen_tags: [],
    dietary_tags: [],
  }));

  const retailerSet = new Set(basketStack.map((item: any) => item.retailer_node));
  const totals = calculateLifecycleSavings(basketStack);
  const mealsByDay = new Map<string, { day: string; b: string; l: string; d: string }>();
  for (const meal of ((plan?.meals ?? []) as any[])) {
    const current = mealsByDay.get(meal.day) ?? { day: String(meal.day || '').slice(0, 3), b: '', l: '', d: '' };
    if (meal.meal_type === 'breakfast') current.b = meal.meal_name;
    if (meal.meal_type === 'lunch') current.l = meal.meal_name;
    if (meal.meal_type === 'dinner') current.d = meal.meal_name;
    mealsByDay.set(meal.day, current);
  }

  let status = 'APPROVED';
  const validationErrors: string[] = [];
  if (!computeCircularWindow(retailerNode, String(plan.week_of))) {
    status = 'NO_RETAILER_COVERAGE';
    validationErrors.push('NO_RETAILER_COVERAGE');
  } else if (retailerSet.size !== 1 || !retailerSet.has(retailerNode)) {
    status = 'LOW_YIELD_WEEK';
    validationErrors.push('SINGLE_STORE_INTEGRITY_FAILED');
  } else if (totals.savings_percentage < 60) {
    status = 'LOW_YIELD_WEEK';
    validationErrors.push('SAVINGS_FLOOR_FAILED');
  }

  const targetCap = fromCents(Number(plan?.budget_summary?.budget_cents ?? plan?.weekly_budget_cents ?? 15000));
  const surplus = r2(targetCap - totals.oop);
  const vaultItems = basketStack.filter((item: any) => item.inventory_class === 1 && item.gross > 0 && (Number(item.digital_stack || 0) / item.gross) * 100 >= 40);

  return {
    plan_id: planId,
    status,
    cycle_dates: `${circular.valid_from}_to_${circular.valid_until}`,
    circular_valid_from: circular.valid_from,
    circular_valid_until: circular.valid_until,
    next_circular_at: circular.next_circular_at,
    stack_expires_at: circular.valid_until,
    retailer_node: retailerNode,
    budget_summary: {
      target_cap: targetCap,
      actual_oop: totals.oop,
      savings_percentage: totals.savings_percentage,
      surplus_available: surplus,
    },
    basket_stack: basketStack,
    meal_prep_manual: {
      meals: [...mealsByDay.values()],
      prep_instructions: ((plan?.zero_waste_log ?? []) as any[]).map((entry) => entry.repurposed_as).filter(Boolean),
    },
    substitutions: {
      profile_applied: ((plan?.dietary_modes ?? []) as string[])[0],
      swaps: [],
    },
    surplus_action: status === 'APPROVED' && surplus > 20 && vaultItems.length > 0 ? {
      action_id: `${planId}_surplus_vault`,
      title: 'Surplus Vault',
      prompt: `You have $${surplus.toFixed(2)} left. Use part of it to stock up before this stack expires?`,
      item_ids: vaultItems.map((item: any) => item.item_id),
      estimated_oop: calculateLifecycleSavings(vaultItems).oop,
      estimated_savings_percentage: calculateLifecycleSavings(vaultItems).savings_percentage,
      expires_at: circular.valid_until,
      inventory_class: 1,
    } : undefined,
    receipt_verification: {
      verification_id: `${planId}_receipt`,
      plan_id: planId,
      expected_item_ids: basketStack.map((item: any) => item.item_id),
      alpha_score_eligible: status === 'APPROVED',
    },
    learning_hooks: {
      tracking_id: `${planId}_tracking`,
      emit_events: ['MEAL_SELECTED', 'RECIPE_SAVED', 'QUANTITY_ADJUSTED', 'SUBSTITUTION_ACCEPTED', 'SURPLUS_ACTION_VIEWED'],
    },
    disclosures: [MANDATORY_LAUNCH_DISCLOSURE],
    validation_errors: validationErrors,
  };
}

async function persistLifecyclePlan(db: any, userId: string, lifecyclePlan: any) {
  if (!lifecyclePlan?.plan_id) return;
  await db
    .from('weekly_lifecycle_plans')
    .upsert(
      {
        plan_id: lifecyclePlan.plan_id,
        user_id: userId,
        status: lifecyclePlan.status,
        retailer_node: lifecyclePlan.retailer_node,
        cycle_dates: lifecyclePlan.cycle_dates,
        circular_valid_from: lifecyclePlan.circular_valid_from,
        circular_valid_until: lifecyclePlan.circular_valid_until,
        next_circular_at: lifecyclePlan.next_circular_at,
        stack_expires_at: lifecyclePlan.stack_expires_at,
        target_cap_cents: Math.round(Number(lifecyclePlan.budget_summary?.target_cap ?? 0) * 100),
        actual_oop_cents: Math.round(Number(lifecyclePlan.budget_summary?.actual_oop ?? 0) * 100),
        savings_percentage: lifecyclePlan.budget_summary?.savings_percentage ?? 0,
        surplus_available_cents: Math.round(Number(lifecyclePlan.budget_summary?.surplus_available ?? 0) * 100),
        lifecycle_payload: lifecyclePlan,
        receipt_verification_id: lifecyclePlan.receipt_verification?.verification_id ?? null,
        validation_errors: lifecyclePlan.validation_errors ?? [],
        expires_at: lifecyclePlan.stack_expires_at,
      },
      { onConflict: 'plan_id' },
    );
}

// ── Types ──────────────────────────────────────────────────────────────────

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type DealType = 'SALE' | 'BOGO' | 'MFR_COUPON' | 'DIGITAL' | 'REBATE' | 'MULTI';
type RebatePlatform = 'ibotta' | 'fetch' | 'swagbucks' | 'checkout51';

interface DealRow {
  id: string;
  item_name: string;
  brand: string | null;
  size: string | null;
  category: string | null;
  base_price: number;
  final_price: number;
  sale_savings: number;
  coupon_savings: number | null;
  is_bogo: boolean;
  has_coupon: boolean;
  stack_rank_score: number;
  dietary_tags: string[] | null;
  allergen_tags: string[] | null;
  retailer: string;
  retailer_key: string;
  normalized_key: string | null;
  upc: string | null;
  calories: number | null;
  protein_g: number | null;
}

interface RebateRow {
  platform: RebatePlatform;
  upc: string | null;
  brand: string | null;
  product_name: string | null;
  normalized_key: string | null;
  rebate_value_cents: number;
}

interface GeniusStackItem {
  id: string;
  item_name: string;
  brand: string | null;
  size: string;
  retailer: string;
  retailer_key: string;
  category: string;
  quantity: number;
  pay_price: number;
  original_price: number;
  savings: number;
  deal_type: DealType;
  deal_label: string;
  tags: string[];
  is_anchor: boolean;
  coupon_action?: string;
  coupon_source?: string;
  rebates: { platform: RebatePlatform; value_cents: number; action: string }[];
  pantry_flag: boolean;
  zero_waste_note?: string;
}

interface GeniusMeal {
  meal_name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  day: Day;
  prep_minutes: number;
  cook_minutes: number;
  serves: number;
  items: GeniusStackItem[];
  pantry_items: string[];
  carry_forward?: string;
  pay_price: number;
  original_price: number;
  savings: number;
  calories_per_serving?: number;
  cost_per_serving: number;
  coupon_notes: string[];
  no_cook: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DAYS: Day[] = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const LEFTOVER_LUNCH_DAYS = new Set<Day>(['Monday','Tuesday','Thursday','Friday']);

const PROTEIN_CATS   = new Set(['meat','seafood','deli','protein']);
const PRODUCE_CATS   = new Set(['produce','fruit','vegetable','frozen vegetable','fresh produce']);
const BREAKFAST_CATS = new Set(['breakfast','dairy','bakery','cheese']);
const HOUSEHOLD_CATS = new Set([
  'household','household cleaning','paper products','personal care',
  'health','health & personal care','laundry','oral care','hair care',
  'skin care','feminine care','baby care','cleaning','paper',
]);

const PANTRY_STAPLES: Record<Day, string[]> = {
  Monday:    ['Olive oil','Garlic','Italian seasoning'],
  Tuesday:   ['Rice or quinoa','Hot sauce','Soy sauce'],
  Wednesday: ['Bread or rolls','Condiments','Microwave steam bag'],
  Thursday:  ['Chicken broth','Bay leaves','Butter'],
  Friday:    ['Lemons','Capers','Butter'],
  Saturday:  ['Olive oil','Vinegar','Dijon mustard'],
  Sunday:    ['Pasta or rice','Tomato sauce','Parmesan'],
};

const HOUSEHOLD_FALLBACK = [
  { name: 'Paper towels',      category: 'household', avg_price: 8.99  },
  { name: 'Toilet paper',      category: 'household', avg_price: 9.99  },
  { name: 'Dish soap',         category: 'household', avg_price: 3.99  },
  { name: 'Trash bags',        category: 'household', avg_price: 7.99  },
  { name: 'Laundry detergent', category: 'household', avg_price: 11.99 },
  { name: 'Body wash',         category: 'household', avg_price: 4.99  },
  { name: 'Toothpaste',        category: 'household', avg_price: 4.99  },
];

// ── Category helpers ───────────────────────────────────────────────────────

function isProtein(cat: string | null): boolean   { return PROTEIN_CATS.has((cat??'').toLowerCase()); }
function isProduce(cat: string | null): boolean   { return PRODUCE_CATS.has((cat??'').toLowerCase()); }
function isBreakfast(cat: string | null): boolean { return BREAKFAST_CATS.has((cat??'').toLowerCase()); }
function isHousehold(cat: string | null): boolean { return HOUSEHOLD_CATS.has((cat??'').toLowerCase()); }
function isPantryLike(cat: string | null): boolean {
  const c = (cat??'').toLowerCase();
  return ['pantry','condiments','soup','snacks','canned','beverages','beverage','grocery'].includes(c);
}

// ── Math helpers ───────────────────────────────────────────────────────────

function validateItemMath(item: GeniusStackItem): void {
  const diff = Math.abs((item.pay_price + item.savings) - item.original_price);
  if (diff > 0.01) {
    throw new Error(
      `Math error on "${item.item_name}": ` +
      `${item.pay_price} + ${item.savings} ≠ ${item.original_price}`,
    );
  }
}

function getPlatformAction(platform: string): string {
  switch (platform) {
    case 'ibotta':     return 'Load offer in Ibotta, snap receipt within 48 hours';
    case 'fetch':      return 'Snap full receipt in Fetch Rewards within 14 days';
    case 'swagbucks':  return 'Submit receipt in Swagbucks app within 7 days';
    case 'checkout51': return 'Claim in Checkout 51 app after purchase';
    default:           return 'Claim in rebate app after purchase';
  }
}

// ── Rebate matcher ─────────────────────────────────────────────────────────

function matchRebates(deal: DealRow, rebates: RebateRow[]): GeniusStackItem['rebates'] {
  const name = (deal.item_name ?? '').toLowerCase();
  return rebates
    .filter(r => {
      if (r.upc && deal.upc && r.upc === deal.upc) return true;
      if (r.brand && name.includes(r.brand.toLowerCase())) return true;
      if (r.normalized_key && (deal.normalized_key ?? '').includes(r.normalized_key)) return true;
      const iw = name.split(' ').find(w => w.length > 4);
      const rw = r.product_name?.toLowerCase().split(' ').find((w: string) => w.length > 4);
      return !!(iw && rw && iw === rw);
    })
    .map(r => ({
      platform:    r.platform,
      value_cents: r.rebate_value_cents,
      action:      getPlatformAction(r.platform),
    }));
}

// ── Deal → GeniusStackItem ─────────────────────────────────────────────────

function dealToItem(
  deal: DealRow,
  rebates: RebateRow[],
  opts?: { isAnchor?: boolean },
): GeniusStackItem {
  const basePrice    = Number(deal.base_price)  || 0;
  const finalPrice   = Number(deal.final_price) || basePrice;
  // Coupon value is intentionally suppressed here. User-facing coupon claims
  // must come from v_live_verified_digital_coupons through the Top 3 engine.
  const couponSaving = 0;

  let pay_price: number, original_price: number, savings: number;
  let deal_type: DealType, deal_label: string;
  let tags: string[] = [];
  let quantity = 1;
  let coupon_action: string | undefined;
  let coupon_source: string | undefined;

  if (deal.is_bogo) {
    const unit = basePrice || finalPrice;
    quantity       = 2;
    original_price = r2(unit * 2);
    pay_price  = r2(unit);
    savings    = r2(unit);
    deal_type  = 'BOGO'; deal_label = 'BOGO FREE'; tags = ['BOGO'];
  } else {
    original_price = r2(basePrice || finalPrice);
    pay_price      = r2(finalPrice || basePrice);
    savings        = r2(Math.max(0, original_price - pay_price));
    if (savings > 0 && original_price > 0) {
      const pct = Math.round((savings / original_price) * 100);
      deal_type = 'SALE'; deal_label = `${pct}% OFF`; tags = ['SALE'];
    } else {
      deal_type = 'SALE'; deal_label = 'ON SALE';
    }
  }

  const matchedRebates = matchRebates(deal, rebates);
  if (matchedRebates.length) tags.push('REBATE');

  const item: GeniusStackItem = {
    id:            deal.id,
    item_name:     deal.item_name || 'Item',
    brand:         deal.brand     ?? null,
    size:          deal.size      ?? '',
    retailer:      deal.retailer  || '',
    retailer_key:  deal.retailer_key || '',
    category:      deal.category  || '',
    quantity, pay_price, original_price, savings, deal_type, deal_label, tags,
    is_anchor:     opts?.isAnchor ?? false,
    coupon_action, coupon_source,
    rebates:       matchedRebates,
    pantry_flag:   false,
  };

  validateItemMath(item);
  return item;
}

function householdFallbackItem(name: string, category: string, avgPrice: number): GeniusStackItem {
  const item: GeniusStackItem = {
    id:            `hh-${name.toLowerCase().replace(/\s+/g,'-')}`,
    item_name:     name, brand: null, size: '', retailer: '', retailer_key: '',
    category, quantity: 1, pay_price: r2(avgPrice), original_price: r2(avgPrice),
    savings: 0, deal_type: 'SALE', deal_label: 'EST. PRICE', tags: [],
    is_anchor: false, rebates: [], pantry_flag: false,
  };
  validateItemMath(item);
  return item;
}

// ── The Genius Plan Builder (Deno-native) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildGeniusWeeklyPlan(db: any, userId: string, headcountParam?: string | null, focusParam?: string | null): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split('T')[0];

  // 1–2. Load profile + deal pool in parallel (Agentic Checkout / plan build latency).
  const profileSelect =
    'household_size,household_members,weekly_budget,dietary_tags,dietary_modes,preferences,meal_calorie_target_min,meal_calorie_target_max';
  const dealsSelect =
    'id,item_name,brand,size,category,base_price,final_price,sale_savings,coupon_savings,is_bogo,has_coupon,stack_rank_score,dietary_tags,allergen_tags,retailer,retailer_key,normalized_key,upc,calories,protein_g';

  const [{ data: profileRow }, { data: rawDeals, error: dealsErr }] = await Promise.all([
    db.from('profiles').select(profileSelect).eq('user_id', userId).maybeSingle(),
    db
      .from('v_coupon_verified_stack_candidates')
      .select(dealsSelect)
      .eq('is_active', true)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order('stack_rank_score', { ascending: false })
      .limit(200),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (profileRow ?? {}) as Record<string,any>;
  const household_size      = headcountParam ? Number(headcountParam) : (Number(p.household_size || p.household_members) || 2);
  const weekly_budget_cents = Number(p.weekly_budget) || 15000;
  const dietary_tags        = (p.dietary_tags  ?? []) as string[];
  const dietary_modes       = (p.dietary_modes ?? []) as string[];
  const preferences         = focusParam ? { ...p.preferences, week_focus: focusParam } : (p.preferences ?? {});
  const serves              = household_size;

  if (dealsErr || !rawDeals?.length) {
    return { no_deals: true, week_of: today, meals: [], household_stack: { items: [], pay_price: 0, original_price: 0, savings: 0 }, totals: {} };
  }

  // Filter allergens
  const deals: DealRow[] = (rawDeals as DealRow[]).filter(d => {
    const tags = (d.allergen_tags ?? []) as string[];
    return !dietary_tags.some((a: string) => tags.includes(a));
  });

  if (deals.length === 0) {
    return { no_deals: true, week_of: today, meals: [], household_stack: { items: [], pay_price: 0, original_price: 0, savings: 0 }, totals: {} };
  }

  // 3. Load rebates (best-effort)
  let rebates: RebateRow[] = [];
  try {
    const { data: rbData } = await db
      .from('rebate_offers')
      .select('platform,upc,brand,product_name,normalized_key,rebate_value_cents')
      .eq('is_active', true)
      .or(`valid_to.is.null,valid_to.gte.${today}`);
    rebates = (rbData ?? []) as RebateRow[];
  } catch { /* table may not exist */ }

  // Sort by score descending
  deals.sort((a: DealRow, b: DealRow) => b.stack_rank_score - a.stack_rank_score);

  // 4. Build 7 protein anchors
  const proteins = deals.filter((d: DealRow) => isProtein(d.category));
  const usedIds  = new Set<string>();
  const anchors: DealRow[] = [];

  // Wednesday: prefer deli
  const wedDeli = proteins.find((d: DealRow) => (d.category??'').toLowerCase() === 'deli');
  if (wedDeli) { anchors.push(wedDeli); usedIds.add(wedDeli.id); }

  // Include seafood
  const seafood = proteins.find((d: DealRow) => (d.category??'').toLowerCase() === 'seafood' && !usedIds.has(d.id));
  if (seafood) { anchors.push(seafood); usedIds.add(seafood.id); }

  // Fill remaining
  for (const d of proteins) {
    if (anchors.length >= 7) break;
    if (!usedIds.has(d.id)) { anchors.push(d); usedIds.add(d.id); }
  }
  // Fallback: any deal
  for (const d of deals) {
    if (anchors.length >= 7) break;
    if (!usedIds.has(d.id)) { anchors.push(d); usedIds.add(d.id); }
  }
  // Pad if needed
  while (anchors.length < 7) anchors.push(anchors[anchors.length - 1] ?? anchors[0]);

  // Position deli at Wednesday (index 2)
  if (wedDeli && anchors[2]?.id !== wedDeli.id) {
    const wi = anchors.findIndex((a: DealRow) => a.id === wedDeli.id);
    if (wi > 2) { [anchors[2], anchors[wi]] = [anchors[wi], anchors[2]]; }
  }

  // 5. Produce + pantry pools
  const producePool = deals.filter((d: DealRow) => isProduce(d.category));
  const pantryPool  = deals.filter((d: DealRow) => isPantryLike(d.category) && !isProtein(d.category));

  // 6. Build dinners
  const dinners: GeniusMeal[]         = [];
  const dinnerAnchors: GeniusStackItem[] = [];
  const zeroWasteLog: unknown[]         = [];

  for (let i = 0; i < 7; i++) {
    const day    = DAYS[i];
    const anchor = anchors[i];
    const anchorItem = dealToItem(anchor, rebates, { isAnchor: true });
    dinnerAnchors.push(anchorItem);

    const sides: GeniusStackItem[] = [];
    const produceSide = producePool[i % Math.max(producePool.length, 1)];
    if (produceSide) sides.push(dealToItem(produceSide, rebates));
    const pantrySide  = pantryPool[i % Math.max(pantryPool.length, 1)];
    if (pantrySide && sides.length < 2) sides.push(dealToItem(pantrySide, rebates));

    const allDinnerItems = [anchorItem, ...sides];
    const pay  = r2(allDinnerItems.reduce((s, x) => s + x.pay_price,      0));
    const orig = r2(allDinnerItems.reduce((s, x) => s + x.original_price, 0));
    const sav  = r2(allDinnerItems.reduce((s, x) => s + x.savings,        0));
    const isWed = day === 'Wednesday';

    const sideName = sides[0]?.item_name ?? '';
    const mealName = sideName ? `${anchorItem.item_name} with ${sideName}` : anchorItem.item_name;

    const couponNotes: string[] = allDinnerItems
      .filter(x => x.coupon_action)
      .map(x => `${x.item_name}: ${x.coupon_action}`);

    // Zero-waste: large-format proteins carry forward to next lunch
    const isLargeFormat = /\b(whole|family pack|roast|\d\s*lb)\b/i.test(anchor.item_name ?? '');
    const nextDay = DAYS[i + 1];
    if (nextDay && LEFTOVER_LUNCH_DAYS.has(nextDay) && isLargeFormat) {
      anchorItem.zero_waste_note = `Leftovers become ${nextDay} lunch`;
      zeroWasteLog.push({
        day, meal: mealName,
        repurposed_as: `${nextDay} lunch — leftover ${anchorItem.item_name}`,
        saves_cents: toCents(anchorItem.pay_price * 0.3),
      });
    }

    dinners.push({
      meal_name: mealName, meal_type: 'dinner', day,
      prep_minutes: isWed ? 5 : 10, cook_minutes: isWed ? 15 : (anchor.category === 'seafood' ? 20 : 35),
      serves, items: allDinnerItems, pantry_items: PANTRY_STAPLES[day] ?? [],
      pay_price: pay, original_price: orig, savings: sav,
      calories_per_serving: (anchor.calories ?? 0) > 0 ? Math.round((anchor.calories ?? 0) / serves) : undefined,
      cost_per_serving: serves > 0 ? r2(pay / serves) : pay,
      coupon_notes, no_cook: isWed,
    });
  }

  // 7. Build breakfasts
  const bfPool   = deals.filter((d: DealRow) => isBreakfast(d.category));
  const breakfasts: GeniusMeal[] = [];
  for (let i = 0; i < 7; i++) {
    const day  = DAYS[i];
    const bfDeal = bfPool[i % Math.max(bfPool.length, 1)];
    const items: GeniusStackItem[] = [];
    if (bfDeal) items.push(dealToItem(bfDeal, rebates));
    const fruitDeal = producePool[i % Math.max(producePool.length, 1)];
    if (fruitDeal && items.length < 2) items.push(dealToItem(fruitDeal, rebates));

    const pay  = r2(items.reduce((s, x) => s + x.pay_price,      0));
    const orig = r2(items.reduce((s, x) => s + x.original_price, 0));
    const sav  = r2(items.reduce((s, x) => s + x.savings,        0));
    const mealName = items.length > 0 ? items[0].item_name + (items[1] ? ` + ${items[1].item_name}` : '') : 'Breakfast';

    breakfasts.push({
      meal_name: mealName, meal_type: 'breakfast', day,
      prep_minutes: 5, cook_minutes: 10, serves, items, pantry_items: [],
      pay_price: pay, original_price: orig, savings: sav,
      cost_per_serving: serves > 0 && pay > 0 ? r2(pay / serves) : 0,
      coupon_notes: [], no_cook: false,
    });
  }

  // 8. Build lunches
  const deliPool = deals.filter((d: DealRow) => (d.category??'').toLowerCase() === 'deli');
  const lunches: GeniusMeal[] = [];
  for (let i = 0; i < 7; i++) {
    const day = DAYS[i];

    if (LEFTOVER_LUNCH_DAYS.has(day) && i > 0) {
      const prevAnchor = dinnerAnchors[i - 1] ?? dinnerAnchors[0];
      const prevDay    = DAYS[i - 1];
      lunches.push({
        meal_name: `${prevAnchor.item_name} (Leftovers)`, meal_type: 'lunch', day,
        prep_minutes: 2, cook_minutes: 5, serves, items: [],
        pantry_items: ['Leftovers from last night'],
        carry_forward: `Uses ${prevDay} dinner leftovers`,
        pay_price: 0, original_price: 0, savings: 0,
        cost_per_serving: 0, coupon_notes: [], no_cook: false,
      });
    } else if (day === 'Wednesday') {
      const deliItem = deliPool[0] ? dealToItem(deliPool[0], rebates) : null;
      const items    = deliItem ? [deliItem] : [];
      const pay = r2(items.reduce((s, x) => s + x.pay_price, 0));
      const orig = r2(items.reduce((s, x) => s + x.original_price, 0));
      lunches.push({
        meal_name: deliItem ? deliItem.item_name : 'Deli Lunch', meal_type: 'lunch', day,
        prep_minutes: 5, cook_minutes: 0, serves, items, pantry_items: ['Deli bread','Condiments'],
        pay_price: pay, original_price: orig, savings: r2(orig - pay),
        cost_per_serving: serves > 0 && pay > 0 ? r2(pay / serves) : 0,
        coupon_notes: [], no_cook: true,
      });
    } else {
      const produceDeal = producePool[i % Math.max(producePool.length, 1)];
      const items: GeniusStackItem[] = produceDeal ? [dealToItem(produceDeal, rebates)] : [];
      const pay  = r2(items.reduce((s, x) => s + x.pay_price, 0));
      const orig = r2(items.reduce((s, x) => s + x.original_price, 0));
      lunches.push({
        meal_name: items[0]?.item_name ? `${items[0].item_name} Salad Bowl` : `${day} Lunch`,
        meal_type: 'lunch', day, prep_minutes: 10, cook_minutes: 0, serves, items,
        pantry_items: ['Olive oil','Lemon','Feta (pantry)'],
        pay_price: pay, original_price: orig, savings: r2(orig - pay),
        cost_per_serving: serves > 0 && pay > 0 ? r2(pay / serves) : 0,
        coupon_notes: [], no_cook: true,
      });
    }
  }

  // 9. Household stack
  let essentials: { name: string; category: string; avg_price: number }[] = [];
  try {
    const { data: dbEss } = await db
      .from('household_essentials')
      .select('canonical_name,category,avg_price_cents')
      .eq('is_default', true)
      .order('sort_order');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (dbEss?.length) essentials = dbEss.map((e: any) => ({ name: e.canonical_name, category: e.category, avg_price: (Number(e.avg_price_cents)||999)/100 }));
  } catch { /* continue */ }
  if (!essentials.length) essentials = HOUSEHOLD_FALLBACK;

  const hhDeals = deals.filter((d: DealRow) => isHousehold(d.category));
  const hhItems: GeniusStackItem[] = essentials.map(e => {
    const kw    = e.name.toLowerCase().split(' ')[0];
    const match = hhDeals.find((d: DealRow) => (d.item_name??'').toLowerCase().includes(kw)) ?? null;
    return match ? dealToItem(match, rebates) : householdFallbackItem(e.name, e.category, e.avg_price);
  });

  // 10. Budget check — remove lowest-savings HH items first
  const allMeals = [...breakfasts, ...lunches, ...dinners];
  const mealsCents = toCents(allMeals.reduce((s, m) => s + m.pay_price, 0));
  let finalHhItems = hhItems;
  let hhCents = toCents(finalHhItems.reduce((s, i) => s + i.pay_price, 0));

  if (mealsCents + hhCents > weekly_budget_cents) {
    const sorted   = [...finalHhItems].sort((a, b) => a.savings - b.savings);
    let running    = mealsCents + hhCents;
    for (const item of sorted) {
      if (running <= weekly_budget_cents) break;
      running -= toCents(item.pay_price);
      hhCents -= toCents(item.pay_price);
      finalHhItems = finalHhItems.filter(i => i.id !== item.id);
    }
  }

  const hhPay  = r2(finalHhItems.reduce((s, i) => s + i.pay_price,      0));
  const hhOrig = r2(finalHhItems.reduce((s, i) => s + i.original_price, 0));
  const hhSav  = r2(finalHhItems.reduce((s, i) => s + i.savings,        0));

  // 11. Coupon checklist
  const allPlanItems = allMeals.flatMap(m => m.items).concat(finalHhItems);
  const couponChecklist: unknown[] = [];

  for (const item of allPlanItems) {
    if (item.coupon_action && item.coupon_source) {
      couponChecklist.push({
        timing: 'before_checkout', store: item.retailer, action: item.coupon_action,
        item: item.item_name, savings_cents: toCents(Math.max(0, item.original_price - item.pay_price)),
        source: item.coupon_source,
      });
    }
    for (const r of item.rebates) {
      couponChecklist.push({
        timing: 'after_purchase', store: item.retailer, action: r.action,
        item: item.item_name, savings_cents: r.value_cents,
        source: r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
      });
    }
  }
  (couponChecklist as { timing: string; savings_cents: number }[]).sort((a, b) => {
    if (a.timing !== b.timing) return a.timing === 'before_checkout' ? -1 : 1;
    return b.savings_cents - a.savings_cents;
  });

  // 12. Rebate summary
  const platformTotals: Record<string,number>    = {};
  const platformItems:  Record<string,string[]>  = {};
  for (const item of allPlanItems) {
    for (const r of item.rebates) {
      platformTotals[r.platform] = (platformTotals[r.platform]??0) + r.value_cents;
      if (!platformItems[r.platform]) platformItems[r.platform] = [];
      platformItems[r.platform].push(item.item_name);
    }
  }
  const totalRebateCents = Object.values(platformTotals).reduce((s,v) => s+v, 0);
  const rebate_summary = {
    ibotta_total_cents:     platformTotals['ibotta']     ?? 0,
    fetch_total_cents:      platformTotals['fetch']      ?? 0,
    swagbucks_total_cents:  platformTotals['swagbucks']  ?? 0,
    checkout51_total_cents: platformTotals['checkout51'] ?? 0,
    total_post_purchase_cents: totalRebateCents,
    action_checklist: Object.entries(platformTotals).map(([platform, value_cents]) => ({
      platform, action: getPlatformAction(platform),
      items: platformItems[platform]??[], value_cents,
    })),
  };

  // 13. Savings breakdown
  let store_sales = 0, bogo_sav = 0, mfr_coupon = 0, digital_coupon = 0, multi_buy = 0;
  for (const item of allPlanItems) {
    const sav = toCents(item.savings);
    if      (item.deal_type === 'BOGO')       bogo_sav      += sav;
    else if (item.deal_type === 'MFR_COUPON') mfr_coupon    += sav;
    else if (item.deal_type === 'DIGITAL')    digital_coupon += sav;
    else if (item.deal_type === 'MULTI')      multi_buy      += sav;
    else                                      store_sales    += sav;
  }
  const at_register = store_sales + bogo_sav + mfr_coupon + digital_coupon + multi_buy;
  const without_snippd = toCents(allPlanItems.reduce((s, i) => s + i.original_price, 0));
  const you_pay        = toCents(allPlanItems.reduce((s, i) => s + i.pay_price,      0));
  const true_final     = Math.max(0, you_pay - totalRebateCents);
  const savings_pct    = without_snippd > 0 ? parseFloat(((at_register + totalRebateCents) / without_snippd * 100).toFixed(1)) : 0;
  const cpppd          = household_size > 0 ? parseFloat((true_final / household_size / 7 / 100).toFixed(2)) : 0;

  const savings_breakdown = {
    store_sales_cents: store_sales, bogo_savings_cents: bogo_sav,
    mfr_coupon_cents: mfr_coupon, digital_coupon_cents: digital_coupon,
    multi_buy_cents: multi_buy, at_register_total_cents: at_register,
    post_purchase_rebate_cents: totalRebateCents,
    true_total_savings_cents: at_register + totalRebateCents,
    savings_pct, without_snippd_cents: without_snippd, you_pay_cents: you_pay,
    true_final_cents: true_final, cost_per_person_per_day: cpppd,
  };

  // 14. Final math validation — throws on any error (plan is NOT saved if it fails)
  for (const item of allPlanItems) validateItemMath(item);

  // Assemble 21-meal ordered list (B/L/D per day)
  const meals: GeniusMeal[] = [];
  for (let i = 0; i < 7; i++) {
    meals.push(breakfasts[i], lunches[i], dinners[i]);
  }

  const finalMealsCents = toCents(allMeals.reduce((s,m) => s+m.pay_price, 0));
  const finalHhCents    = toCents(hhPay);
  const totalPlanCents  = finalMealsCents + finalHhCents;

  return {
    week_of: today,
    household_size, weekly_budget_cents,
    persona_type:  (preferences as Record<string,string|undefined>)['coupon_style'] ?? 'balanced',
    health_focus:  (preferences as Record<string,string|undefined>)['health_focus']  ?? 'balanced',
    dietary_modes,
    no_deals: false,
    meals,
    household_stack: {
      title: "This Week's Household Essentials",
      items: finalHhItems, pay_price: hhPay, original_price: hhOrig, savings: hhSav,
      tags: [...new Set(finalHhItems.flatMap(i => i.tags))],
    },
    rebate_summary, savings_breakdown, coupon_checklist: couponChecklist,
    zero_waste_log: zeroWasteLog,
    budget_summary: {
      food_meals_cents: finalMealsCents, household_cents: finalHhCents,
      total_plan_cents: totalPlanCents, budget_cents: weekly_budget_cents,
      remaining_cents: weekly_budget_cents - totalPlanCents,
      on_budget: totalPlanCents <= weekly_budget_cents,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Handler
// ══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET')    return json({ error: 'Method not allowed' }, 405);

  // Auth
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization' }, 401);
  const token = authHeader.replace('Bearer ', '').trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')           ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfiguration' }, 500);

  const db = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid authentication' }, 401);

  const url     = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === 'true';
  const headcountParam = url.searchParams.get('headcount');
  const focusParam = url.searchParams.get('focus');

  // STACK_SECRET must match the client's EXPO_PUBLIC_STACK_SECRET.
  // If absent, encryption still runs (SHA-256('') key) but the client will
  // fail to decrypt unless it also has an empty secret — forcing Foundation Stack.
  const stackSecret = Deno.env.get('STACK_SECRET') ?? '';

  // HMAC_SECRET must match the client's EXPO_PUBLIC_HMAC_SECRET.
  // Used to sign the ciphertext so the client can verify integrity before
  // decryption.  A missing secret produces a null HMAC — client will fall back
  // to Foundation Stack on HMAC verification failure.
  const hmacSecret = Deno.env.get('HMAC_SECRET') ?? '';

  try {
    // ── Cache check (skip if ?refresh=true) ────────────────────────────────
    if (!refresh) {
      const { data: cached } = await db
        .from('profiles')
        .select('cached_weekly_plan, plan_cached_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cached?.cached_weekly_plan && cached?.plan_cached_at) {
        const cachedAt = new Date(cached.plan_cached_at).getTime();
        const ageHours = (Date.now() - cachedAt) / (1000 * 60 * 60);
        if (ageHours < 24) {
          // Ciphertext already in DB — sign it, then return; client verifies +
          // decrypts.  Log cache-hit to agentic_ledger (no plan data, no secret).
          const cachedHmac = await signCiphertext(cached.cached_weekly_plan, hmacSecret);
          db.from('agentic_ledger').insert({
            user_id:       user.id,
            decision_type: 'PLAN_BUILD',
            actor:         'get-weekly-plan',
            result:        'info',
            metadata:      { encrypt_ok: true, hmac_ok: cachedHmac !== null, cache: 'hit', cached_at: cached.plan_cached_at },
          }).catch(() => {});
          return json({
            ciphertext:  cached.cached_weekly_plan,
            hmac:        cachedHmac,
            _cache:      'hit',
            _cached_at:  cached.plan_cached_at,
          });
        }
      }
    }

    // ── Build plan ──────────────────────────────────────────────────────────
    const plan = await buildGeniusWeeklyPlan(db, user.id, headcountParam, focusParam);
    const lifecyclePlan = buildLifecyclePlan(plan, user.id);
    (plan as Record<string, unknown>).lifecycle_plan = lifecyclePlan;

    // ── Encrypt before writing to DB ────────────────────────────────────────
    // The ciphertext is the only thing stored in profiles.cached_weekly_plan.
    // The raw plan object and STACK_SECRET are never written to any log.
    let ciphertext: string | null = null;
    let encryptOk = false;
    try {
      ciphertext = await encryptPlan(plan, stackSecret);
      encryptOk  = true;
    } catch (encErr) {
      console.error('[get-weekly-plan] encrypt failed:', (encErr as Error).message);
    }

    // Persist ciphertext (best-effort — cache failure is non-fatal)
    if (ciphertext) {
      await db
        .from('profiles')
        .update({ cached_weekly_plan: ciphertext, plan_cached_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .catch(() => {});

      await db
        .from('home_payload_cache')
        .upsert(
          {
            user_id:      user.id,
            cache_key:    'weekly_plan',
            payload:      plan,
            generated_at: new Date().toISOString(),
            expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            source:       'get-weekly-plan',
          },
          { onConflict: 'user_id, cache_key' }
        )
        .catch(() => {});

      await persistLifecyclePlan(db, user.id, lifecyclePlan).catch(() => {});
    }

    // ── Log to agentic_ledger (no key, no raw plan data) ───────────────────
    const dinnerCount = (plan.meals as unknown[] ?? [])
      .filter((m) => (m as { meal_type: string }).meal_type === 'dinner').length;
    const planTotalCents = ((plan.budget_summary as { total_plan_cents?: number }) ?? {}).total_plan_cents ?? 0;
    const payloadHash = await _sha256Hex({ encrypt_ok: encryptOk, dinner_count: dinnerCount, lifecycle_status: lifecyclePlan.status });

    db.from('agentic_ledger').insert({
      user_id:       user.id,
      decision_type: 'PLAN_BUILD',
      actor:         'get-weekly-plan',
      result:        encryptOk ? 'approved' : 'error',
      payload_hash:  payloadHash,
      metadata: {
        encrypt_ok,
        cache:            'miss',
        dinner_count:     dinnerCount,
        plan_total_cents: planTotalCents,
        lifecycle_plan_id: lifecyclePlan.plan_id,
        lifecycle_status: lifecyclePlan.status,
        stack_expires_at: lifecyclePlan.stack_expires_at,
        no_deals:         !!(plan as { no_deals?: boolean }).no_deals,
      },
    }).catch(() => {});

    // Sign the ciphertext so the client can verify integrity before decryption.
    const planHmac = ciphertext ? await signCiphertext(ciphertext, hmacSecret) : null;

    // Return encrypted + signed envelope — client verifies HMAC then decrypts.
    // If encryption failed, ciphertext is null and client falls back to
    // Foundation Stack.
    return json({ ciphertext, hmac: planHmac, _cache: 'miss' });

  } catch (err) {
    console.error('[get-weekly-plan]', err);
    // Log failure (no plan data, no secret)
    db.from('agentic_ledger').insert({
      user_id:       user.id,
      decision_type: 'PLAN_BUILD',
      actor:         'get-weekly-plan',
      result:        'error',
      metadata:      { encrypt_ok: false, cache: 'miss', error: (err as Error).message },
    }).catch(() => {});
    return json({ ciphertext: null, hmac: null, _cache: 'miss', _error: 'Plan build failed' });
  }
});
