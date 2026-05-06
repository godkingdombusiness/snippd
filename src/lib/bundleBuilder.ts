// Pure meal bundle builder for ChefStashScreen.
// No DB calls. No side effects. Input: normalized offers + user prefs → bundles + swaps.

export interface OfferItem {
  id: string;
  product_name: string;
  brand: string | null;
  retailer: string;
  price_cents: number | null;
  final_unit_price_cents: number | null;
  regular_price_cents: number | null;
  savings_cents: number | null;
  confidence_score: number;
  category: string | null;
  deal_type: string;
}

export interface MealBundle {
  id: string;
  title: string;
  retailer: string;
  items: OfferItem[];
  totalCents: number;
  savingsCents: number | null;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface SwapSuggestion {
  currentItem: OfferItem;
  swapItem: OfferItem;
  savingsCents: number;
}

export interface BundleOptions {
  budgetCents?: number | null;
  preferredStores?: string[];
  categoryClicks?: Record<string, number>;
  experienceType?: 'saver' | 'convenience' | 'explorer';
  maxBundles?: number;
}

// ── Internal ──────────────────────────────────────────────────────────────────

const TITLES: Record<string, string[]> = {
  saver:       ['Budget Dinner Plan', 'Smart Savings Meal', 'Pantry Builder Pack'],
  convenience: ['Quick Family Meal', 'Express Pantry Run', 'Fast Weeknight Dinner'],
  explorer:    ['Discovery Bundle', 'Seasonal Mix Pack', 'Variety Haul'],
};

function confidenceLabel(avg: number): 'High' | 'Medium' | 'Low' {
  if (avg >= 0.8) return 'High';
  if (avg >= 0.6) return 'Medium';
  return 'Low';
}

function scoreOffer(
  o: OfferItem,
  preferredStores: string[],
  topCats: string[],
  experienceType: string,
): number {
  let s = 0;
  if (o.savings_cents) s += o.savings_cents / 100;

  const cat = (o.category || '').toLowerCase();
  const catIdx = topCats.findIndex(c => cat.includes(c));
  if (catIdx !== -1) s += (topCats.length - catIdx) * 10;

  if (preferredStores.some(p => p.toLowerCase() === o.retailer.toLowerCase())) s += 30;

  if (experienceType === 'saver' && o.final_unit_price_cents != null) {
    s += Math.max(0, 500 - o.final_unit_price_cents) / 100;
  }
  return s;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function buildBundles(offers: OfferItem[], opts: BundleOptions = {}): MealBundle[] {
  const {
    budgetCents     = null,
    preferredStores = [],
    categoryClicks  = {},
    experienceType  = 'saver',
    maxBundles      = 3,
  } = opts;

  if (!offers.length) return [];

  const topCats = Object.entries(categoryClicks)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k.toLowerCase());

  // convenience users get smaller bundles
  const itemsPerBundle = experienceType === 'convenience' ? 3 : 4;
  const titles = TITLES[experienceType] ?? TITLES.saver;

  const sorted = [...offers].sort(
    (a, b) => scoreOffer(b, preferredStores, topCats, experienceType)
            - scoreOffer(a, preferredStores, topCats, experienceType),
  );

  // Group by retailer
  const byRetailer: Record<string, OfferItem[]> = {};
  for (const o of sorted) {
    (byRetailer[o.retailer] = byRetailer[o.retailer] || []).push(o);
  }

  // Preferred stores first, then largest pools
  const preferred = preferredStores.filter(s =>
    Object.keys(byRetailer).some(r => r.toLowerCase() === s.toLowerCase())
  );
  const rest = Object.keys(byRetailer)
    .filter(r => !preferredStores.some(s => s.toLowerCase() === r.toLowerCase()))
    .sort((a, b) => byRetailer[b].length - byRetailer[a].length);
  const retailerOrder = [...preferred, ...rest];

  const bundles: MealBundle[] = [];
  const used = new Set<string>();

  for (const retailer of retailerOrder) {
    if (bundles.length >= maxBundles) break;
    const pool = byRetailer[retailer].filter(o => !used.has(o.id));
    if (pool.length < 2) continue;

    let items = pool.slice(0, itemsPerBundle);

    // Budget gate: try trimming before skipping
    if (budgetCents != null) {
      const total = items.reduce((s, o) => s + (o.final_unit_price_cents ?? o.price_cents ?? 0), 0);
      if (total > budgetCents) {
        items = items.slice(0, 3);
        const trimTotal = items.reduce((s, o) => s + (o.final_unit_price_cents ?? o.price_cents ?? 0), 0);
        if (trimTotal > budgetCents) continue;
      }
    }

    const totalCents = items.reduce((s, o) => s + (o.final_unit_price_cents ?? o.price_cents ?? 0), 0);
    const hasSavings = items.some(o => (o.savings_cents ?? 0) > 0);
    const savingsCents = hasSavings
      ? items.reduce((s, o) => s + (o.savings_cents ?? 0), 0)
      : null;
    const avgConf = items.reduce((s, o) => s + o.confidence_score, 0) / items.length;

    items.forEach(o => used.add(o.id));
    bundles.push({
      id: `bundle_${retailer}_${bundles.length}`,
      title: titles[bundles.length % titles.length],
      retailer,
      items,
      totalCents,
      savingsCents,
      confidence: confidenceLabel(avgConf),
    });
  }

  // Cross-retailer fallback when pool is thin
  if (bundles.length < 2) {
    const remaining = sorted.filter(o => !used.has(o.id)).slice(0, itemsPerBundle);
    if (remaining.length >= 2) {
      const totalCents = remaining.reduce((s, o) => s + (o.final_unit_price_cents ?? o.price_cents ?? 0), 0);
      const hasSavings = remaining.some(o => (o.savings_cents ?? 0) > 0);
      const avgConf = remaining.reduce((s, o) => s + o.confidence_score, 0) / remaining.length;
      bundles.push({
        id: `bundle_mixed`,
        title: titles[bundles.length % titles.length],
        retailer: 'Multiple Stores',
        items: remaining,
        totalCents,
        savingsCents: hasSavings ? remaining.reduce((s, o) => s + (o.savings_cents ?? 0), 0) : null,
        confidence: confidenceLabel(avgConf),
      });
    }
  }

  return bundles;
}

/**
 * Finds offers for the same product at different retailers where switching
 * saves money. Groups by first-3-token product key.
 */
export function findSwaps(offers: OfferItem[], maxSwaps = 3): SwapSuggestion[] {
  function productKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
      .slice(0, 3)
      .join(' ');
  }

  const byKey: Record<string, OfferItem[]> = {};
  for (const o of offers) {
    const k = productKey(o.product_name);
    (byKey[k] = byKey[k] || []).push(o);
  }

  const swaps: SwapSuggestion[] = [];
  for (const group of Object.values(byKey)) {
    if (group.length < 2) continue;
    const withPrice = group
      .filter(o => (o.final_unit_price_cents ?? o.price_cents) != null)
      .sort(
        (a, b) =>
          (a.final_unit_price_cents ?? a.price_cents ?? 0) -
          (b.final_unit_price_cents ?? b.price_cents ?? 0),
      );
    if (withPrice.length < 2) continue;

    const cheapest = withPrice[0];
    const priciest = withPrice[withPrice.length - 1];
    if (cheapest.retailer === priciest.retailer) continue;

    const diff =
      (priciest.final_unit_price_cents ?? priciest.price_cents ?? 0) -
      (cheapest.final_unit_price_cents ?? cheapest.price_cents ?? 0);
    if (diff < 25) continue; // must save > $0.25 to show

    swaps.push({ currentItem: priciest, swapItem: cheapest, savingsCents: diff });
    if (swaps.length >= maxSwaps) break;
  }

  return swaps.sort((a, b) => b.savingsCents - a.savingsCents);
}
