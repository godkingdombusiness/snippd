// Pure product matching helpers for the Normalized Offer Engine.
// No external dependencies, no database calls, no ML.
// Uses token-based Jaccard similarity + brand + size proximity.

export interface ProductInput {
  product_name: string;
  brand?: string | null;
  normalized_size?: number | null;
  normalized_unit?: string | null;
}

export interface MatchResult {
  matched: boolean;
  match_score: number;   // 0.0 – 1.0
  reasons: string[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Splits a product name into lowercase alpha-numeric tokens, length > 1. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Jaccard similarity between two token arrays.
 * Score = |intersection| / |union|
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionCount++;
  }
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersectionCount / unionSize;
}

/**
 * Strips common noise words that hurt token matching
 * (e.g. "of", "with", "and", "the", size units).
 */
const STOP_WORDS = new Set([
  'of', 'with', 'and', 'the', 'a', 'an', 'in', 'for', 'or',
  'oz', 'lb', 'lbs', 'ct', 'pk', 'fl', 'ml', 'kg', 'gal',
]);

function meaningfulTokens(text: string): string[] {
  return tokenize(text).filter(t => !STOP_WORDS.has(t));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compares two grocery products and returns a structured match result.
 *
 * Scoring weights:
 *   Name similarity  — 0.50  (Jaccard on meaningful tokens)
 *   Brand match      — 0.30  (exact 0.30, partial/substring 0.15)
 *   Size proximity   — 0.20  (same unit, within 10%)
 *
 * A product is "matched" when match_score >= 0.5.
 *
 * Does NOT use ML, paid APIs, or heavy dependencies.
 */
export function matchProducts(
  productA: ProductInput,
  productB: ProductInput,
): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  // ── 1. Name similarity (weight 0.50) ─────────────────────────
  const tokensA = meaningfulTokens(productA.product_name);
  const tokensB = meaningfulTokens(productB.product_name);
  const nameSim = jaccardSimilarity(tokensA, tokensB);

  score += nameSim * 0.5;
  if (nameSim >= 0.6) {
    reasons.push(`name_similarity(${Math.round(nameSim * 100)}%)`);
  } else if (nameSim >= 0.35) {
    reasons.push(`name_partial(${Math.round(nameSim * 100)}%)`);
  }

  // ── 2. Brand match (weight 0.30) ──────────────────────────────
  const brandA = productA.brand?.toLowerCase().trim() ?? null;
  const brandB = productB.brand?.toLowerCase().trim() ?? null;

  if (brandA && brandB) {
    if (brandA === brandB) {
      score += 0.30;
      reasons.push('brand_exact');
    } else if (brandA.includes(brandB) || brandB.includes(brandA)) {
      score += 0.15;
      reasons.push('brand_partial');
    } else {
      // Partial token overlap on brand names (e.g. "Kraft Foods" vs "Kraft")
      const brandTokensA = tokenize(brandA);
      const brandTokensB = tokenize(brandB);
      const brandSim = jaccardSimilarity(brandTokensA, brandTokensB);
      if (brandSim >= 0.5) {
        score += 0.10;
        reasons.push(`brand_token_overlap(${Math.round(brandSim * 100)}%)`);
      }
    }
  }
  // No brand available on one or both — skip, don't penalize

  // ── 3. Size proximity (weight 0.20) ───────────────────────────
  const sizeA = productA.normalized_size;
  const sizeB = productB.normalized_size;
  const unitA = productA.normalized_unit;
  const unitB = productB.normalized_unit;

  if (sizeA != null && sizeB != null) {
    if (unitA === unitB) {
      // Same unit — check if within 10%
      const avg = (sizeA + sizeB) / 2;
      const diff = Math.abs(sizeA - sizeB);
      if (avg > 0 && diff / avg <= 0.10) {
        score += 0.20;
        reasons.push(`size_within_10pct(${sizeA}${unitA ?? ''}≈${sizeB}${unitB ?? ''})`);
      } else if (avg > 0 && diff / avg <= 0.25) {
        score += 0.05;
        reasons.push(`size_within_25pct`);
      }
    } else if (unitA != null && unitB != null) {
      // Different units — attempt conversion for oz/lb and g/kg
      const convertedA = toOunces(sizeA, unitA);
      const convertedB = toOunces(sizeB, unitB);
      if (convertedA != null && convertedB != null) {
        const avg = (convertedA + convertedB) / 2;
        const diff = Math.abs(convertedA - convertedB);
        if (avg > 0 && diff / avg <= 0.10) {
          score += 0.20;
          reasons.push(`size_converted_match`);
        }
      }
    }
  }

  const finalScore = parseFloat(Math.min(1, score).toFixed(3));
  return {
    matched: finalScore >= 0.5,
    match_score: finalScore,
    reasons,
  };
}

/** Converts common weight units to ounces for cross-unit comparison. */
function toOunces(size: number, unit: string): number | null {
  switch (unit) {
    case 'oz':  return size;
    case 'lb':  return size * 16;
    case 'g':   return size * 0.035274;
    case 'kg':  return size * 35.274;
    case 'fl oz': return size;
    default:    return null;
  }
}
