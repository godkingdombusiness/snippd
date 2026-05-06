/**
 * DeterministicAnchor — SKU budget guard.
 *
 * Hard-rejects any SKU whose final price exceeds the remaining budget
 * for the current planning session. This is the authoritative enforcement
 * point; the UI badges in DiscoverScreen are informational only.
 *
 * All rejections are synchronous and deterministic — no network calls,
 * no probabilistic logic. The same input always produces the same output.
 */

export interface AnchorSKU {
  id: string;
  item_name: string;
  /** Final price in dollars (post-sale, pre-rebate) */
  final_price: number;
  retailer_key?: string;
  category?: string | null;
}

export interface AnchorResult {
  approved: AnchorSKU[];
  rejected: Array<{ sku: AnchorSKU; reason: string; delta_cents: number }>;
  remaining_cents_after: number;
}

/**
 * Converts a dollar price to cents with rounding.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Hard-rejects any SKU where toCents(sku.final_price) > remainingCents.
 *
 * @param skus           Candidate SKUs from the Hunt
 * @param remainingCents Remaining budget in cents for this week
 * @returns              AnchorResult with approved list, rejected list, and
 *                       remaining budget after approvals
 */
export function runAnchor(skus: AnchorSKU[], remainingCents: number): AnchorResult {
  const approved: AnchorSKU[] = [];
  const rejected: AnchorResult['rejected'] = [];
  let pool = remainingCents;

  for (const sku of skus) {
    const priceCents = toCents(sku.final_price);

    if (priceCents <= pool) {
      approved.push(sku);
      // Do NOT deduct from pool here — the anchor only gates entry, not sequencing.
      // Sequential budget deduction is handled by the cart accumulator.
    } else {
      rejected.push({
        sku,
        reason: `Price ${priceCents}¢ exceeds remaining budget ${pool}¢`,
        delta_cents: priceCents - pool,
      });
    }
  }

  return { approved, rejected, remaining_cents_after: pool };
}

/**
 * Single-SKU compliance check — use this inside tight render loops
 * where running the full anchor batch is wasteful.
 */
export function isAnchorCompliant(finalPriceDollars: number, remainingCents: number): boolean {
  return toCents(finalPriceDollars) <= remainingCents;
}
