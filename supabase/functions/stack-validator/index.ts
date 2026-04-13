/**
 * stack-validator Edge Function
 *
 * Validates and enriches every active stack in app_home_feed.
 * Fixes the core problem: vertex-agent-crawl inserts stacks with bare
 * breakdown_list items ({ item, type, price }) and no deal_type,
 * coupon_url, savings, or confidence data.
 *
 * What it does per stack:
 *  1. Sends the stack's items to Gemini with a strict validation prompt
 *  2. Gemini returns enriched items: deal_type, price, savings, coupon, coupon_url
 *  3. Builds product-search coupon URLs for any item without a specific URL
 *  4. Writes enriched breakdown_list + confidence_score back to app_home_feed
 *  5. Marks validation timestamp in preference_profile
 *
 * Modes (POST body):
 *  { "validate_all": true }           → process every active stack
 *  { "stack_id": "uuid" }             → validate one specific stack
 *  { "test": true }                   → health check
 *  { "dry_run": true }                → validate but do NOT write to DB (preview)
 *
 * Scheduled: run via pg_cron after every vertex-agent crawl
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Gemini call with retry — handles 503 high-demand responses ───────────────
async function callGemini(prompt: string, geminiKey: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: `PROMPT: SNIPPD DATA ARCHITECT SYSTEM OVERHAUL
Role: You are the Lead Systems Architect for Snippd.
Mission: Transform raw retail data into 7-Day Foundation Stacks.

STRICT GUARDRAILS:
1. NO PHANTOMS: Delete any item that isn't a physical product (e.g., Target Circle %, Rewards, Tax).
2. NAME PURITY: Format: [Brand] [Product] [Size]. Strip all prices ($) and "off" text from names.
3. REGISTER TRUTH: Ensure 'pay_price' + 'savings' = 'original_price' for every item.
4. CATEGORY LOCK: Only use: 'protein', 'dairy', 'produce', 'grain', 'pantry', 'vegetable', 'fruit', 'household'.
5. ANCHOR MANDATE: Every Foundation stack MUST have exactly 7 Protein Anchors (isAnchor: true).
6. DISLIKE FILTER: If user 'dislikes' are provided, purge all items containing those ingredients.`,
            }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    // Retry on 503/429 with exponential backoff
    if ((res.status === 503 || res.status === 429) && attempt < retries) {
      const wait = 1500 * Math.pow(2, attempt); // 1.5s, 3s, 6s
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
    }

    const data  = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const raw   = parts.find((p: { text?: string; thought?: boolean }) => !p.thought && p.text)?.text
               ?? parts[parts.length - 1]?.text ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) return clean.slice(start, end + 1);
    return clean;
  }
  throw new Error('Gemini failed after all retries');
}

// ── Product-search coupon URL builder (mirrors StackDetailScreen logic) ────────
const COUPON_SEARCH: Record<string, (n: string) => string> = {
  target:         (n) => `https://www.target.com/s?searchTerm=${encodeURIComponent(n)}`,
  cvs:            (n) => `https://www.cvs.com/search?searchTerm=${encodeURIComponent(n)}`,
  walgreens:      (n) => `https://www.walgreens.com/search/results.jsp?Ntt=${encodeURIComponent(n)}`,
  kroger:         (n) => `https://www.kroger.com/savings/cl/coupons?q=${encodeURIComponent(n)}`,
  walmart:        (n) => `https://www.walmart.com/search?q=${encodeURIComponent(n)}`,
  dollar_general: (_) => `https://www.dollargeneral.com/savings/digital-coupons.html`,
  dollar_tree:    (_) => `https://www.dollartree.com/catalog/category/view/id/1`,
  publix:         (_) => `https://www.publix.com/savings/coupons`,
  aldi:           (_) => `https://www.aldi.us/en/savings/`,
  sprouts:        (n) => `https://www.sprouts.com/deals/?q=${encodeURIComponent(n)}`,
  whole_foods:    (n) => `https://www.amazon.com/s?k=${encodeURIComponent(n)}`,
  heb:            (n) => `https://www.heb.com/search?q=${encodeURIComponent(n)}`,
  trader_joes:    (_) => `https://www.traderjoes.com/home/products/category/new-items`,
  winn_dixie:     (_) => `https://www.winndixie.com/savings/digital-coupons`,
  food_lion:      (_) => `https://www.foodlion.com/savings/`,
};

function buildCouponUrl(itemName: string, storeKey: string): string | null {
  const key = storeKey.toLowerCase().replace(/[\s']+/g, '_');
  const fn = COUPON_SEARCH[key]
    ?? Object.entries(COUPON_SEARCH).find(([k]) => key.includes(k))?.[1];
  return fn ? fn(itemName) : null;
}

// ── Validation prompt ─────────────────────────────────────────────────────────
function buildValidationPrompt(
  stackTitle: string,
  retailer: string,
  items: Record<string, unknown>[],
): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const itemsJson = JSON.stringify(items, null, 2);

  return `You are a grocery deal validation agent for the Snippd savings app. Today is ${today}.

You are reviewing a grocery stack called "${stackTitle}" from ${retailer}.

Here are the items in this stack as currently stored:
${itemsJson}

Your job: validate and enrich each item. For each item, determine:

1. "deal_type" — pick the MOST ACCURATE one:
   - "SALE" — item is marked down from regular shelf price
   - "BOGO" — buy one get one free or half off
   - "MFR_COUPON" — manufacturer coupon (paper or digital)
   - "STORE_COUPON" — store-specific digital coupon (e.g. Publix eCoupon, Target Circle)
   - "DIGITAL" — generic digital coupon clipped in app
   - "CLEARANCE" — clearance/markdown item
   - "REBATE" — Ibotta or Fetch rebate (post-purchase submission)
   Use "SALE" as default if no specific coupon is involved.

2. "price" — the realistic sale/deal price in dollars for ${retailer}. Keep close to input if reasonable. Round to nearest $0.10.

3. "regular_price" — the normal everyday shelf price (typically 15–40% above sale price).

4. "savings" — dollar amount saved from regular shelf price (regular_price - price).

5. "coupon" — additional coupon value in dollars (0 if no specific coupon, non-zero only for MFR_COUPON, STORE_COUPON, DIGITAL).

6. "brand" — known brand name if identifiable (e.g. "Tyson", "Kraft", "Great Value"), or "" if generic.

7. "size" — package size/weight if inferable (e.g. "2 lb", "12 oz", "6-pack"), or "".

8. "confidence" — your confidence this is a real, currently-available deal at ${retailer}:
   - 0.9–1.0: Very confident (common item, realistic price, typical deal type)
   - 0.7–0.89: Confident (plausible item and price for this store)
   - 0.5–0.69: Moderate (item exists but price or deal type uncertain)
   - Below 0.5: Low (item or price seems off for this retailer)

Respond with EXACTLY this JSON structure (object, not array):
{
  "stack_confidence": <average of all item confidence scores, 0–1>,
  "items": [
    {
      "name": "<original item name>",
      "brand": "<brand or empty string>",
      "size": "<size or empty string>",
      "deal_type": "<SALE|BOGO|MFR_COUPON|STORE_COUPON|DIGITAL|CLEARANCE|REBATE>",
      "price": <number>,
      "regular_price": <number>,
      "savings": <number>,
      "coupon": <number>,
      "confidence": <number 0–1>
    }
  ]
}

Rules:
- Output exactly as many items as were in the input (${items.length} items)
- Keep item names exactly as given — do not rename
- BOGO items should have coupon=0 and savings equal to the item price (the free item)
- Never set price to 0 unless it's truly free
- Be realistic for ${retailer} prices in the United States`;
}

const PHANTOM_ITEM_REGEX = /\b(circle|reward|redcard|discount|savings|weekly ad|rebate|coupon|percent)\b|%/i;
const PRICE_LEAK_REGEX = /\$\s*\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s*(?:off|percent?)\b|\b(?:save|savings|saving|saved)\b/gi;
const ALLOWED_ITEM_CATEGORIES = ['protein', 'dairy', 'produce', 'grain', 'pantry', 'vegetable', 'fruit', 'household'] as const;

type AllowedItemCategory = (typeof ALLOWED_ITEM_CATEGORIES)[number];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeItemName(rawName: string, brand = '', size = ''): string {
  let name = String(rawName || '').trim();
  if (!name) return '';

  name = name
    .replace(PRICE_LEAK_REGEX, '')
    .replace(/%/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (brand) {
    const normalizedBrand = String(brand || '').trim();
    if (normalizedBrand && !name.toLowerCase().startsWith(normalizedBrand.toLowerCase())) {
      name = `${normalizedBrand} ${name}`.trim();
    }
  }

  if (size) {
    const normalizedSize = String(size || '').trim();
    if (normalizedSize && !name.toLowerCase().includes(normalizedSize.toLowerCase())) {
      name = `${name} (${normalizedSize})`.trim();
    }
  }

  name = name.replace(/\s{2,}/g, ' ').trim();
  return name;
}

function isPhantomItem(item: BreakdownItem): boolean {
  const raw = String(item.name || item.item || '').trim();
  if (!raw) return true;
  if (PHANTOM_ITEM_REGEX.test(raw)) return true;
  return false;
}

function inferItemCategory(category: unknown, name: string, tags: unknown): string {
  const rawCategory = String(category || '').trim().toLowerCase();
  const itemName = String(name || '').toLowerCase();
  const tagText = Array.isArray(tags) ? String(tags.join(' ')).toLowerCase() : '';

  if (ALLOWED_ITEM_CATEGORIES.includes(rawCategory as AllowedItemCategory)) return rawCategory || 'pantry';
  if (/\b(chicken|beef|pork|turkey|fish|tofu|sausage|bacon|ham|steak|ground beef|protein|egg|eggs|yogurt)\b/.test(itemName)) return 'protein';
  if (/\b(milk|cheese|yogurt|butter|cream|ice cream|dairy)\b/.test(itemName)) return 'dairy';
  if (/\b(apple|banana|orange|berry|berries|grape|melon|kiwi|fruit|avocado|pear)\b/.test(itemName)) return 'fruit';
  if (/\b(lettuce|spinach|broccoli|carrot|tomato|cucumber|vegetable|zucchini|cauliflower|kale|greens|herb)\b/.test(itemName)) return 'vegetable';
  if (/\b(bread|pasta|rice|cereal|oats|flour|cracker|beans|lentil|sauce|oil|vinegar|canned|jarred|spice|pantry)\b/.test(itemName)) return 'pantry';
  if (/\b(soap|detergent|paper towel|toilet paper|cleaner|trash bag|household|plastic wrap|foil|disposable)\b/.test(itemName)) return 'household';
  if (/\b(salad|produce|mushroom|vegetables)\b/.test(itemName)) return 'produce';
  if (/\b(grocery|essential|misc)\b/.test(rawCategory) || /\b(grocery|essential|misc)\b/.test(itemName)) return 'pantry';
  if (ALLOWED_ITEM_CATEGORIES.some(cat => tagText.includes(cat))) {
    return ALLOWED_ITEM_CATEGORIES.find(cat => tagText.includes(cat)) ?? 'pantry';
  }

  return rawCategory || 'pantry';
}

function normalizeQuantity(item: BreakdownItem, dealType = ''): number {
  const explicitQty = Number(item.qty ?? item.quantity ?? 0);
  if (explicitQty > 0) return Math.max(1, explicitQty);

  const dt = String(dealType || item.deal_type || item.type || '').toUpperCase();
  if (dt.includes('BOGO') || dt.includes('B1G1') || dt.includes('BUY ONE GET ONE')) return 2;
  return 1;
}

// ── Enrich one stack ──────────────────────────────────────────────────────────
interface BreakdownItem {
  name?: string;
  item?: string;
  brand?: string;
  size?: string;
  deal_type?: string;
  type?: string;
  price?: number;
  regular_price?: number;
  savings?: number;
  coupon?: number;
  coupon_url?: string;
  confidence?: number;
  _category?: string;
  [key: string]: unknown;
}

interface ValidationResult {
  stack_confidence: number;
  items: {
    name: string;
    brand: string;
    size: string;
    deal_type: string;
    price: number;
    regular_price: number;
    savings: number;
    coupon: number;
    confidence: number;
  }[];
}

async function validateStack(
  stack: Record<string, unknown>,
  geminiKey: string,
  dryRun: boolean,
  db: ReturnType<typeof createClient>,
): Promise<{ id: string; confidence: number; updated: boolean; error?: string }> {
  const stackId    = String(stack.id ?? '');
  const title      = String(stack.title ?? stack.stack_name ?? 'Unknown');
  const retailer   = String(stack.retailer ?? stack.store ?? '');
  const storeKey   = retailer.toLowerCase().replace(/[\s']+/g, '_');

  // Parse breakdown_list
  let items: BreakdownItem[] = [];
  const rawBd = stack.breakdown_list;
  if (Array.isArray(rawBd)) {
    items = rawBd as BreakdownItem[];
  } else if (typeof rawBd === 'string') {
    try { items = JSON.parse(rawBd); } catch { items = []; }
  }

  if (items.length === 0) {
    return { id: stackId, confidence: 0, updated: false, error: 'empty breakdown_list' };
  }

  // Send to Gemini for validation
  let validation: ValidationResult;
  try {
    const prompt  = buildValidationPrompt(title, retailer, items);
    const rawJson = await callGemini(prompt, geminiKey);
    validation    = JSON.parse(rawJson) as ValidationResult;

    if (!Array.isArray(validation.items) || validation.items.length === 0) {
      throw new Error('Gemini returned no items');
    }
  } catch (e) {
    return { id: stackId, confidence: 0, updated: false, error: `Gemini error: ${String(e).slice(0, 120)}` };
  }

  // Merge Gemini results back into breakdown items, preserving original fields
  const enrichedItems: BreakdownItem[] = items.map((orig, i) => {
    const validated = validation.items[i];
    if (!validated) return orig;

    const itemName    = String(orig.name || orig.item || validated.name || '');
    const brand       = String(validated.brand || orig.brand || '').trim();
    const size        = String(validated.size || orig.size || '').trim();
    const dealTypeRaw = String(validated.deal_type || orig.deal_type || orig.type || 'SALE').toUpperCase();
    const dealType    = dealTypeRaw === 'B1G1' ? 'BOGO' : dealTypeRaw;
    const quantity    = normalizeQuantity(orig, dealType);
    const sanitized   = normalizeItemName(itemName, brand, size);
    const category    = inferItemCategory(orig._category ?? orig.category, sanitized, stack.tags ?? []);
    const isBogo      = dealType === 'BOGO';

    const couponUrl = isBogo ? null : buildCouponUrl(sanitized, storeKey);

    return {
      ...orig,
      name:          sanitized || itemName,
      item:          sanitized || itemName,
      brand,
      size,
      deal_type:     dealType,
      type:          dealType,
      price:         round2(Number(validated.price) || Number(orig.price) || 0),
      regular_price: round2(Number(validated.regular_price) || Number(orig.price) || 0),
      savings:       round2(Number(validated.savings) || 0),
      coupon:        round2(Number(validated.coupon) || 0),
      coupon_url:    couponUrl,
      confidence:    Number(validated.confidence) || 0.5,
      qty:           quantity,
      quantity,
      category,
      _category:     category,
      _validated:    true,
      _validated_at: new Date().toISOString(),
    };
  });

  const stackConfidence = Number(validation.stack_confidence) || (
    enrichedItems.reduce((s, i) => s + (Number(i.confidence) || 0.5), 0) / enrichedItems.length
  );

  const physicalItems = enrichedItems.filter(item => {
    if (isPhantomItem(item)) return false;
    if (!String(item.name || item.item || '').trim()) return false;
    if (Number(item.price) <= 0) return false;
    return true;
  });

  if (physicalItems.length === 0) {
    return { id: stackId, confidence: stackConfidence, updated: false, error: 'All items removed by phantom-item filter' };
  }

  const foundationTitle = title.toLowerCase().includes('7-day foundation');
  if (foundationTitle) {
    const anchorCount = physicalItems.filter(item => item.isAnchor === true && String(item.category || '').toLowerCase() === 'protein').length;
    if (anchorCount !== 7) {
      return {
        id: stackId,
        confidence: stackConfidence,
        updated: false,
        error: `7-Day Foundation stack requires exactly 7 protein anchors, found ${anchorCount}`,
      };
    }
  }

  const totalPay = round2(physicalItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity || item.qty || 1) || 1), 0));
  const totalSavings = round2(physicalItems.reduce((sum, item) => sum + (Number(item.savings) || 0) * (Number(item.quantity || item.qty || 1) || 1), 0));
  const totalRegular = round2(physicalItems.reduce((sum, item) => sum + (Number(item.regular_price) || 0) * (Number(item.quantity || item.qty || 1) || 1), 0));

  const declaredPay = round2(Number(stack.pay_price) || totalPay);
  const declaredSave = round2(Number(stack.save_price) || totalSavings);
  const declaredOriginal = round2(Number(stack.original_price ?? totalRegular));

  if (Math.abs(declaredPay + declaredSave - declaredOriginal) > 0.01) {
    return {
      id: stackId,
      confidence: stackConfidence,
      updated: false,
      error: `Register truth failed: pay_price + savings (${declaredPay + declaredSave}) does not equal original_price (${declaredOriginal})`,
    };
  }

  const bogoErrors = physicalItems.filter(item => String(item.deal_type || item.type || '').toUpperCase() === 'BOGO' && Number(item.quantity) === 1);
  if (bogoErrors.length > 0) {
    return {
      id: stackId,
      confidence: stackConfidence,
      updated: false,
      error: 'BOGO items must have quantity 2. Found one or more BOGO items with qty 1.',
    };
  }

  if (dryRun) {
    return { id: stackId, confidence: stackConfidence, updated: false };
  }

  if (totalPay <= 0) {
    return { id: stackId, confidence: stackConfidence, updated: false, error: 'Computed pay_price is invalid' };
  }

  const priceUpdate = {
    pay_price:  totalPay,
    save_price: Math.max(0, totalSavings),
  };

  const { error: updateErr } = await db
    .from('app_home_feed')
    .update({
      breakdown_list:      physicalItems,
      confidence_score:    Math.round(stackConfidence * 100) / 100,
      ...priceUpdate,
      verification_status: stackConfidence >= 0.7 ? 'verified_live' : stackConfidence >= 0.4 ? 'needs_review' : 'unverified',
      preference_profile: {
        ...(typeof stack.preference_profile === 'object' && stack.preference_profile !== null
          ? stack.preference_profile as Record<string, unknown>
          : {}),
        last_validated:    new Date().toISOString(),
        validation_source: 'stack-validator-v1',
      },
    })
    .eq('id', stackId);

  if (updateErr) {
    return { id: stackId, confidence: stackConfidence, updated: false, error: updateErr.message };
  }

  return { id: stackId, confidence: stackConfidence, updated: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ?? '';

  if (!geminiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // Health check
  if (body.test) return json({ ok: true, service: 'stack-validator', ts: new Date().toISOString() });

  const rawAiOutput = Array.isArray(body.rawAiOutput) ? body.rawAiOutput : null;
  const stackId     = typeof body.stackId === 'string' ? body.stackId : (typeof body.stack_id === 'string' ? body.stack_id : null);
  const dryRun      = body.dry_run === true;
  const validateAll = body.validate_all === true;
  const batchLimit  = typeof body.limit  === 'number' ? Math.min(body.limit, 15)  : 10;
  const batchOffset = typeof body.offset === 'number' ? body.offset : 0;

  if (rawAiOutput && stackId) {
    const cleanedItems = rawAiOutput.filter((item: any) => {
      const name = (item.name || item.item || '').toString().toLowerCase();
      return !name.match(/%|reward|circle|redcard|discount|savings|tax/i);
    }).map((item: any) => ({
      ...item,
      name: (item.name || item.item || '').toString().replace(/\$\d+(?:\.\d{1,2})?|(?:\d+)?\s?off/gi, '').trim(),
      category: item.category === 'Grocery' || !item.category
        ? 'pantry'
        : item.category.toString().toLowerCase(),
    }));

    const anchorCount = cleanedItems.filter((i: any) => i.isAnchor === true).length;
    if (anchorCount < 7) {
      return json({ error: 'Invalid Stack: Need 7 Protein Anchors' }, 400);
    }

    const { error } = await db
      .from('app_home_feed')
      .update({
        breakdown_list: cleanedItems,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', stackId);

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (!stackId && !validateAll) {
    return json({ error: 'Provide stack_id or validate_all: true' }, 400);
  }

  // Fetch stacks to validate
  let stacks: Record<string, unknown>[] = [];
  if (stackId) {
    const { data, error } = await db
      .from('app_home_feed')
      .select('id, title, retailer, breakdown_list, preference_profile, pay_price, save_price, confidence_score')
      .eq('id', stackId)
      .single();
    if (error || !data) return json({ error: error?.message ?? 'Stack not found' }, 404);
    stacks = [data as Record<string, unknown>];
  } else {
    // Active stacks — use limit+offset for batching to avoid 150s Edge Function timeout
    const { data, error } = await db
      .from('app_home_feed')
      .select('id, title, retailer, breakdown_list, preference_profile, pay_price, save_price, confidence_score')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .range(batchOffset, batchOffset + batchLimit - 1);
    if (error) return json({ error: error.message }, 500);
    stacks = (data ?? []) as Record<string, unknown>[];
  }

  if (stacks.length === 0) return json({ message: 'No stacks to validate', validated: 0 });

  // Process stacks sequentially with a delay to respect Gemini rate limits
  const results: { id: string; confidence: number; updated: boolean; error?: string }[] = [];
  let validated = 0;
  let failed    = 0;
  let skipped   = 0;

  for (const stack of stacks) {
    // Skip stacks with empty breakdown_list — nothing to validate
    const rawBd = stack.breakdown_list;
    const hasItems = Array.isArray(rawBd) ? rawBd.length > 0
      : typeof rawBd === 'string' ? rawBd.length > 4
      : false;

    if (!hasItems) {
      skipped++;
      results.push({ id: String(stack.id), confidence: 0, updated: false, error: 'no items' });
      continue;
    }

    const result = await validateStack(stack, geminiKey, dryRun, db);
    results.push(result);

    if (result.error && !result.updated) failed++;
    else validated++;

    // Throttle: 400ms between calls to stay within Gemini free-tier limits
    if (stacks.length > 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Audit log
  try {
    await db.from('cron_audit_log').insert({
      run_type:   'stack-validator',
      status:     failed === stacks.length ? 'error' : 'success',
      details: {
        total:     stacks.length,
        validated,
        failed,
        skipped,
        dry_run:   dryRun,
        results:   results.slice(0, 50), // cap to avoid oversized log entries
      },
      created_at: new Date().toISOString(),
    });
  } catch { /* audit log is best-effort */ }

  return json({
    ok:        true,
    dry_run:   dryRun,
    total:     stacks.length,
    validated,
    failed,
    skipped,
    avg_confidence: results.length > 0
      ? Math.round((results.reduce((s, r) => s + r.confidence, 0) / results.length) * 100) / 100
      : 0,
    results,
  });
});
