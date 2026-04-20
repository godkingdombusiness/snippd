import type { Offer } from "./fetchOffers";
import {
  estimateLineCents,
  generateSevenPlusOneBundle,
} from "./generateMealStack";

export type StrategyKey = "budget" | "quick" | "chef";

export type StoreDef = {
  id: string;
  name: string;
  /** Basis points: 10000 = 1.00× applied to estimated basket. */
  priceMultiplierBps: number;
  origin: string;
};

/** Canonical store list — 3 strategies are generated per store. */
export const STORE_DEFS: StoreDef[] = [
  {
    id: "walmart",
    name: "Walmart",
    priceMultiplierBps: 10000,
    origin: "https://www.walmart.com",
  },
  {
    id: "aldi",
    name: "Aldi",
    priceMultiplierBps: 9300,
    origin: "https://www.aldi.us",
  },
  {
    id: "target",
    name: "Target",
    priceMultiplierBps: 10400,
    origin: "https://www.target.com",
  },
];

function filterOffersForStore(all: Offer[], storeId: string): Offer[] {
  const tagged = all.filter((o) => o.store_key);
  if (!tagged.length) return all;
  const forStore = all.filter((o) => o.store_key === storeId);
  return forStore.length ? forStore : all;
}

export function sumBundleEstimatedCents(bundle: ReturnType<
  typeof generateSevenPlusOneBundle
>): number {
  let sum = 0;
  for (const d of bundle.dinners) {
    for (const it of d.items) {
      sum += estimateLineCents(it);
    }
  }
  for (const it of bundle.household_essentials.items) {
    sum += estimateLineCents(it);
  }
  return sum;
}

function applyStoreDisplayCents(
  rawCents: number,
  store: StoreDef
): number {
  return Math.round((rawCents * store.priceMultiplierBps) / 10000);
}

export type StrategyBundle = {
  key: StrategyKey;
  label: string;
  bundle: ReturnType<typeof generateSevenPlusOneBundle>;
  rawEstimatedCents: number;
  displayTotalCents: number;
};

export type StoreStrategies = {
  store: StoreDef;
  budget: StrategyBundle;
  quick: StrategyBundle;
  chef: StrategyBundle;
};

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  budget: "Budget",
  quick: "Quick",
  chef: "Chef",
};

function buildStrategy(
  store: StoreDef,
  key: StrategyKey,
  offers: Offer[],
  weekOf: string,
  weeklyBudgetCents: number
): StrategyBundle {
  const bundle = generateSevenPlusOneBundle(
    offers,
    weekOf,
    weeklyBudgetCents,
    key
  );
  const raw = sumBundleEstimatedCents(bundle);
  return {
    key,
    label: STRATEGY_LABELS[key],
    bundle,
    rawEstimatedCents: raw,
    displayTotalCents: applyStoreDisplayCents(raw, store),
  };
}

/** Exactly 3 strategies per store (Budget, Quick, Chef), each 7 dinners + household essentials. */
export function buildStrategiesByStore(
  allOffers: Offer[],
  weekOf: string,
  weeklyBudgetCents: number
): Record<string, StoreStrategies> {
  const out: Record<string, StoreStrategies> = {};

  for (const store of STORE_DEFS) {
    const offers = filterOffersForStore(allOffers, store.id);
    out[store.id] = {
      store,
      budget: buildStrategy(store, "budget", offers, weekOf, weeklyBudgetCents),
      quick: buildStrategy(store, "quick", offers, weekOf, weeklyBudgetCents),
      chef: buildStrategy(store, "chef", offers, weekOf, weeklyBudgetCents),
    };
  }

  return out;
}

export function orderedStores(preferredStoreIds: string[]): StoreDef[] {
  const pref = preferredStoreIds.filter(Boolean);
  const head = STORE_DEFS.filter((s) => pref.includes(s.id));
  const headIds = new Set(head.map((s) => s.id));
  const tail = STORE_DEFS.filter((s) => !headIds.has(s.id));
  return [...head, ...tail];
}

export function buildShopTourLinks(
  store: StoreDef,
  bundle: ReturnType<typeof generateSevenPlusOneBundle>
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  let i = 0;
  for (const d of bundle.dinners) {
    i += 1;
    const first = d.items[0];
    const q = first?.headline ?? `dinner ${i}`;
    links.push({
      label: `Night ${i}: ${q.slice(0, 48)}`,
      url: `${store.origin}/search?q=${encodeURIComponent(q)}`,
    });
  }
  links.push({
    label: "Household essentials",
    url: `${store.origin}/search?q=${encodeURIComponent("toilet paper cleaning supplies")}`,
  });
  return links;
}
