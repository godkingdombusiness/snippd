// Pure deal scoring — no Supabase imports, fully testable.
// Called by the score-deals Edge Function (copied into Deno via esm.sh).

export interface ScoredDeal {
  id: string;
  product_name: string;
  retailer: string;
  price_cents: number | null;
  final_unit_price_cents: number | null;
  regular_price_cents: number | null;
  savings_cents: number | null;
  deal_type: string | null;
  category: string | null;
  confidence_score: number;
  // Nutrition (null = not enriched yet)
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  usda_food_id: number | null;
  nutrition_confidence: number | null;
  // Computed
  composite_score: number;
  score_breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  savings_score: number;       // 0–1
  nutrition_score: number;     // 0–1
  preference_score: number;    // 0–1
  novelty_score: number;       // 0–1
  composite: number;           // weighted sum
}

export interface FilterObject {
  stores: string[];            // empty = all stores
  preferences: string[];       // e.g. ['vegetarian','keto','family','budget']
  nutrition: {
    min_protein: number | null;   // g per 100g
    max_carbs: number | null;
    max_calories: number | null;
    max_sodium: number | null;
  };
}

export interface UserContext {
  preferred_stores: string[];
  category_clicks: Record<string, number>;   // category → click count
  last_seen_deals: string[];                 // offer IDs seen recently
}

export interface NutritionSummary {
  avg_calories: number | null;
  avg_protein: number | null;
  avg_carbs: number | null;
  avg_fat: number | null;
  enriched_count: number;
  total_count: number;
}

// ── Weights ─────────────────────────────────────────────────────────────────

const W = {
  savings:     0.45,
  nutrition:   0.25,
  preference:  0.20,
  novelty:     0.10,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Protein density: protein / calories * 100 → higher is better (lean food)
function proteinDensity(deal: ScoredDeal): number {
  if (deal.protein == null || deal.calories == null || deal.calories === 0) return 0;
  return (deal.protein / deal.calories) * 100;  // protein % of calories (approx)
}

function savingsScore(deal: ScoredDeal): number {
  const s = deal.savings_cents ?? 0;
  // Normalize: $0 = 0, $5+ = 1.0 (most grocery deals top out around $5)
  return clamp01(s / 500);
}

function nutritionScore(deal: ScoredDeal): number {
  if (deal.calories == null) return 0.5;  // unknown = neutral
  const density = proteinDensity(deal);
  // High protein density is good; penalise very high calories (>500/100g)
  const calPenalty = deal.calories > 500 ? clamp01((deal.calories - 500) / 500) * 0.3 : 0;
  return clamp01(clamp01(density / 10) - calPenalty);
}

function preferenceScore(deal: ScoredDeal, user: UserContext, filters: FilterObject): number {
  let score = 0.5;

  // Preferred store
  if (user.preferred_stores.includes(deal.retailer)) score += 0.2;

  // Category affinity from click history
  if (deal.category) {
    const clicks = user.category_clicks[deal.category] ?? 0;
    if (clicks > 0) score += clamp01(clicks / 10) * 0.2;
  }

  // Dietary preference match (rough category-based heuristics)
  const prefs = filters.preferences;
  if (prefs.includes('vegetarian') && isLikelyMeat(deal)) score -= 0.3;
  if (prefs.includes('budget') && (deal.savings_cents ?? 0) > 200) score += 0.15;
  if (prefs.includes('keto') && deal.carbs != null && deal.carbs < 10) score += 0.15;
  if (prefs.includes('family') && deal.deal_type === 'BOGO') score += 0.1;

  return clamp01(score);
}

function noveltyScore(deal: ScoredDeal, lastSeen: string[]): number {
  return lastSeen.includes(deal.id) ? 0 : 1;
}

function isLikelyMeat(deal: ScoredDeal): boolean {
  const name = (deal.product_name ?? '').toLowerCase();
  return ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'fish', 'salmon', 'shrimp'].some(m => name.includes(m));
}

// ── applyNutritionFilters ────────────────────────────────────────────────────

export function applyNutritionFilters(deals: ScoredDeal[], filters: FilterObject): ScoredDeal[] {
  const { min_protein, max_carbs, max_calories, max_sodium } = filters.nutrition;
  return deals.filter(d => {
    // Skip filter if deal has no nutrition data (don't exclude unenriched deals)
    if (d.calories == null && d.protein == null) return true;
    if (min_protein  != null && d.protein  != null && d.protein  < min_protein)  return false;
    if (max_carbs    != null && d.carbs    != null && d.carbs    > max_carbs)     return false;
    if (max_calories != null && d.calories != null && d.calories > max_calories)  return false;
    if (max_sodium   != null && d.sodium   != null && d.sodium   > max_sodium)    return false;
    return true;
  });
}

// ── applyStoreFilter ─────────────────────────────────────────────────────────

export function applyStoreFilter(deals: ScoredDeal[], stores: string[]): ScoredDeal[] {
  if (!stores.length) return deals;
  return deals.filter(d => stores.includes(d.retailer));
}

// ── scoreDeals ───────────────────────────────────────────────────────────────

export function scoreDeals(
  deals: ScoredDeal[],
  user: UserContext,
  filters: FilterObject,
): ScoredDeal[] {
  return deals.map(deal => {
    const ss = savingsScore(deal);
    const ns = nutritionScore(deal);
    const ps = preferenceScore(deal, user, filters);
    const nv = noveltyScore(deal, user.last_seen_deals);

    const composite = W.savings * ss + W.nutrition * ns + W.preference * ps + W.novelty * nv;

    return {
      ...deal,
      composite_score: parseFloat(composite.toFixed(4)),
      score_breakdown: {
        savings_score:    parseFloat(ss.toFixed(4)),
        nutrition_score:  parseFloat(ns.toFixed(4)),
        preference_score: parseFloat(ps.toFixed(4)),
        novelty_score:    parseFloat(nv.toFixed(4)),
        composite:        parseFloat(composite.toFixed(4)),
      },
    };
  }).sort((a, b) => b.composite_score - a.composite_score);
}

// ── buildNutritionSummary ────────────────────────────────────────────────────

export function buildNutritionSummary(deals: ScoredDeal[]): NutritionSummary {
  const enriched = deals.filter(d => d.calories != null);
  if (!enriched.length) {
    return { avg_calories: null, avg_protein: null, avg_carbs: null, avg_fat: null, enriched_count: 0, total_count: deals.length };
  }

  const avg = (key: keyof ScoredDeal): number | null => {
    const vals = enriched.map(d => d[key] as number | null).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  };

  return {
    avg_calories: avg('calories'),
    avg_protein:  avg('protein'),
    avg_carbs:    avg('carbs'),
    avg_fat:      avg('fat'),
    enriched_count: enriched.length,
    total_count:    deals.length,
  };
}
