/**
 * savingsBreakdownEngine.ts
 *
 * Builds a savings receipt from stack items and automatically matches
 * rebates from the rebate_offers table (Ibotta / Fetch / Swagbucks / Checkout51).
 *
 * Key design: rebate matching runs after items are selected, NOT at build time.
 * Rebates are NEVER subtracted from pay_price — they are tracked separately and
 * summed into true_final_cents only in the totals block.
 *
 * Run standalone:
 *   npx ts-node --project tsconfig.test.json src/services/savingsBreakdownEngine.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RebatePlatform = 'ibotta' | 'fetch' | 'swagbucks' | 'checkout51';

export interface StackItemForReceipt {
  id: string;
  item_name: string;
  brand?: string | null;
  upc?: string | null;
  normalized_key?: string | null;
  category: string;
  base_price: number;       // dollars — regular shelf price
  final_price: number;      // dollars — what they pay at register
  sale_savings: number;     // dollars — at-register savings
  coupon_savings?: number;  // dollars — additional coupon reduction
  is_bogo: boolean;
  has_coupon: boolean;
  retailer: string;
  retailer_key: string;
  quantity?: number;
}

export interface RebateOffer {
  id: string;
  platform: RebatePlatform;
  upc?: string | null;
  brand?: string | null;
  product_name?: string | null;
  normalized_key?: string | null;
  rebate_value_cents: number;
  claim_url?: string | null;
  valid_to?: string | null;
  is_active: boolean;
}

export interface AttachedRebate {
  platform: RebatePlatform;
  value_cents: number;
  claim_url?: string | null;
  action: string;
  expires?: string | null;
}

export interface ReceiptLineItem extends StackItemForReceipt {
  rebates: AttachedRebate[];
  reg_cents: number;
  pay_cents: number;
  saved_cents: number;       // at-register savings in cents
  rebate_cents: number;      // post-purchase rebate total in cents
  true_final_cents: number;  // pay_cents - rebate_cents
}

export interface RebatePlatformSummary {
  platform: string;
  total_cents: number;
  action: string;
  items: string[];
}

export interface SavingsReceipt {
  items: ReceiptLineItem[];
  totals: {
    reg_cents: number;
    pay_cents: number;
    at_register_savings_cents: number;
    rebate_cents: number;
    true_final_cents: number;
    savings_pct: number;
    by_platform: Partial<Record<RebatePlatform, number>>;
  };
  rebate_platforms: RebatePlatformSummary[];
  coupon_checklist: {
    timing: 'before_checkout' | 'after_purchase';
    action: string;
    item: string;
    savings_cents: number;
    source: string;
  }[];
}

// ─── Platform action copy ──────────────────────────────────────────────────

function getPlatformAction(platform: string): string {
  switch (platform) {
    case 'ibotta':     return 'Load offer in Ibotta app, then snap receipt within 48 hours';
    case 'fetch':      return 'Snap full receipt in Fetch Rewards within 14 days';
    case 'swagbucks':  return 'Submit receipt in Swagbucks app within 7 days';
    case 'checkout51': return 'Claim offer in Checkout 51 app after purchase';
    default:           return 'Claim in rebate app after purchase';
  }
}

// ─── Rebate matching ───────────────────────────────────────────────────────

function matchesRebate(item: StackItemForReceipt, r: RebateOffer): boolean {
  // 1. UPC exact match — highest confidence
  if (r.upc && item.upc && r.upc === item.upc) return true;

  // 2. Brand fuzzy match — item_name contains rebate brand
  if (r.brand && item.item_name?.toLowerCase().includes(r.brand.toLowerCase())) return true;

  // 3. Normalized key substring match
  if (r.normalized_key && item.normalized_key?.includes(r.normalized_key)) return true;

  // 4. First significant word overlap (>4 chars) between item_name and product_name
  const itemWord   = item.item_name?.split(' ').find(w => w.length > 4)?.toLowerCase();
  const rebateWord = r.product_name?.split(' ').find(w => w.length > 4)?.toLowerCase();
  return !!(itemWord && rebateWord && itemWord === rebateWord);
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function buildSavingsReceipt(
  sb: SupabaseClient,
  stackItems: StackItemForReceipt[],
): Promise<SavingsReceipt> {
  // Fetch all active rebates in one round-trip — best-effort (no throw on missing table)
  let allRebates: RebateOffer[] = [];
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await sb
      .from('rebate_offers')
      .select('id, platform, upc, brand, product_name, normalized_key, rebate_value_cents, claim_url, valid_to, is_active')
      .eq('is_active', true)
      .gte('valid_to', today);
    allRebates = (data ?? []) as RebateOffer[];
  } catch {
    // rebate_offers may not exist yet — continue without rebates
  }

  // Build receipt line items
  const items: ReceiptLineItem[] = stackItems.map(item => {
    const matched = allRebates.filter(r => matchesRebate(item, r));

    const attachedRebates: AttachedRebate[] = matched.map(r => ({
      platform:    r.platform,
      value_cents: r.rebate_value_cents,
      claim_url:   r.claim_url ?? undefined,
      action:      getPlatformAction(r.platform),
      expires:     r.valid_to ?? undefined,
    }));

    const regCents     = Math.round((item.base_price  || 0) * 100);
    const payCents     = Math.round((item.final_price || 0) * 100);
    const savedCents   = Math.max(0, regCents - payCents);
    const rebateCents  = attachedRebates.reduce((s, r) => s + r.value_cents, 0);
    const trueFinal    = Math.max(0, payCents - rebateCents);

    return {
      ...item,
      rebates:          attachedRebates,
      reg_cents:        regCents,
      pay_cents:        payCents,
      saved_cents:      savedCents,
      rebate_cents:     rebateCents,
      true_final_cents: trueFinal,
    };
  });

  // Aggregate totals
  const regCents    = items.reduce((s, i) => s + i.reg_cents,    0);
  const payCents    = items.reduce((s, i) => s + i.pay_cents,    0);
  const savedCents  = items.reduce((s, i) => s + i.saved_cents,  0);
  const rebateCents = items.reduce((s, i) => s + i.rebate_cents, 0);
  const trueFinal   = items.reduce((s, i) => s + i.true_final_cents, 0);

  // Group rebates by platform
  const byPlatform: Partial<Record<RebatePlatform, number>> = {};
  const platformItemMap: Partial<Record<RebatePlatform, string[]>> = {};

  for (const item of items) {
    for (const r of item.rebates) {
      byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + r.value_cents;
      if (!platformItemMap[r.platform]) platformItemMap[r.platform] = [];
      platformItemMap[r.platform]!.push(item.item_name);
    }
  }

  const rebatePlatforms: RebatePlatformSummary[] = Object.entries(byPlatform).map(
    ([platform, total_cents]) => ({
      platform,
      total_cents: total_cents as number,
      action: getPlatformAction(platform),
      items: platformItemMap[platform as RebatePlatform] ?? [],
    }),
  );

  // Build coupon checklist — before_checkout first, sorted by savings DESC
  const couponChecklist: SavingsReceipt['coupon_checklist'] = [];

  for (const item of items) {
    if (item.has_coupon && (item.coupon_savings ?? 0) > 0) {
      couponChecklist.push({
        timing:        'before_checkout',
        action:        `Clip digital coupon for ${item.item_name} in ${item.retailer} app`,
        item:          item.item_name,
        savings_cents: Math.round((item.coupon_savings ?? 0) * 100),
        source:        `${item.retailer} App`,
      });
    }
  }

  for (const item of items) {
    for (const r of item.rebates) {
      couponChecklist.push({
        timing:        'after_purchase',
        action:        r.action,
        item:          item.item_name,
        savings_cents: r.value_cents,
        source:        r.platform.charAt(0).toUpperCase() + r.platform.slice(1),
      });
    }
  }

  couponChecklist.sort((a, b) => {
    if (a.timing !== b.timing) return a.timing === 'before_checkout' ? -1 : 1;
    return b.savings_cents - a.savings_cents;
  });

  const savingsPct =
    regCents > 0
      ? parseFloat(((savedCents + rebateCents) / regCents * 100).toFixed(1))
      : 0;

  return {
    items,
    totals: {
      reg_cents:                  regCents,
      pay_cents:                  payCents,
      at_register_savings_cents:  savedCents,
      rebate_cents:               rebateCents,
      true_final_cents:           trueFinal,
      savings_pct:                savingsPct,
      by_platform:                byPlatform,
    },
    rebate_platforms: rebatePlatforms,
    coupon_checklist: couponChecklist,
  };
}

// ─── CLI entry point ───────────────────────────────────────────────────────

if (require.main === module) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );

  // Sample run: fetch top 5 active deals and build a receipt
  sb.from('stack_candidates')
    .select('id, item_name, category, base_price, final_price, sale_savings, coupon_savings, is_bogo, has_coupon, retailer, retailer_key, normalized_key')
    .eq('is_active', true)
    .order('stack_rank_score', { ascending: false })
    .limit(5)
    .then(({ data }: { data: StackItemForReceipt[] | null }) =>
      buildSavingsReceipt(sb, data ?? []),
    )
    .then((receipt: SavingsReceipt) => {
      console.log('SavingsBreakdownEngine — receipt built');
      console.log(`  Items:           ${receipt.items.length}`);
      console.log(`  You pay:         $${(receipt.totals.pay_cents / 100).toFixed(2)}`);
      console.log(`  Register savings:$${(receipt.totals.at_register_savings_cents / 100).toFixed(2)}`);
      console.log(`  Rebates:         $${(receipt.totals.rebate_cents / 100).toFixed(2)}`);
      console.log(`  True final:      $${(receipt.totals.true_final_cents / 100).toFixed(2)}`);
      console.log(`  Savings %:       ${receipt.totals.savings_pct}%`);
      console.log(`  Rebate platforms: ${receipt.rebate_platforms.map(p => p.platform).join(', ') || 'none'}`);
    })
    .catch(console.error);
}
