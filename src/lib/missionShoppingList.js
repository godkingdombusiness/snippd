import { estimateLineCents } from "./generateMealStack";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Flattens a locked 7+1 bundle into checklist rows for My List. */
export function bundleToShoppingList(activeBundle, storeDef) {
  const base = storeDef?.origin ?? "";
  const list = [];

  const dinners = activeBundle?.bundle?.dinners ?? [];
  for (const d of dinners) {
    for (const it of d.items ?? []) {
      if (!it?.id) continue;
      list.push({
        id: uid(),
        offerId: it.id,
        label: it.headline,
        category: it.category,
        cents: estimateLineCents(it),
        checked: false,
        storeId: activeBundle.storeId,
        productUrl: `${base}/search?q=${encodeURIComponent(it.headline)}`,
      });
    }
  }

  const hh = activeBundle?.bundle?.household_essentials?.items ?? [];
  for (const it of hh) {
    if (!it?.id) continue;
    list.push({
      id: uid(),
      offerId: it.id,
      label: it.headline,
      category: it.category,
      cents: estimateLineCents(it),
      checked: false,
      storeId: activeBundle.storeId,
      productUrl: `${base}/search?q=${encodeURIComponent(it.headline)}`,
    });
  }

  return list;
}

export function findBudgetSafeReplacement(offers, missingItem, toleranceCents = 75) {
  const target = missingItem?.cents ?? 0;
  const cat = missingItem?.category;
  const pool = offers.filter(
    (o) => o.category === cat && o.id !== missingItem.offerId
  );
  if (!pool.length) return null;

  const scored = pool
    .map((o) => ({
      offer: o,
      cents: estimateLineCents(o),
      delta: Math.abs(estimateLineCents(o) - target),
    }))
    .filter((x) => x.delta <= toleranceCents)
    .sort((a, b) => a.delta - b.delta);

  return scored[0]?.offer ?? null;
}
