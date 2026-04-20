export type Offer = {
  id: string;
  promo_type: string;
  headline: string;
  category: string | null;
  deal_price: number | null;
  regular_price: number | null;
  required_qty: number;
  store_key?: string | null;
};

const score = (o: Offer) =>
  (o.promo_type === "bogo" ? 1000 : 0) +
  (o.promo_type === "sale" ? 600 : 0) +
  (o.deal_price ? 50 : 0) +
  (o.regular_price ? 50 : 0);

const pickTop = (offers: Offer[], category: string) =>
  offers.filter(o => o.category === category).sort((a,b) => score(b)-score(a))[0];

export function generateMealStack(offers: Offer[], week_of: string, weeklyBudgetCents: number) {
  const stackBudgetCents = Math.floor(weeklyBudgetCents * 0.25);
  const perDinnerCapCents = Math.floor(stackBudgetCents / 4);

  const protein = pickTop(offers, "protein");
  const starch  = pickTop(offers, "starch") ?? pickTop(offers, "breakfast");
  const veg     = pickTop(offers, "vegetable") ?? pickTop(offers, "frozen");

  const warnings: string[] = [];
  if (!protein) warnings.push("Missing protein");
  if (!starch) warnings.push("Missing starch");
  if (!veg) warnings.push("Missing vegetable");

  const dinners = [1,2,3,4].map(slot => ({
    slot,
    servings: 6,
    per_dinner_cap_cents: perDinnerCapCents,
    items: [protein, starch, veg].filter(Boolean)
  }));

  return {
    stack_type: "meal",
    week_of,
    budget_cents: stackBudgetCents,
    dinners,
    warning_banner: warnings.length ? "Closest Possible — limited deals this week" : null
  };
}

export function generateHouseholdStack(
  offers: Offer[],
  week_of: string,
  weeklyBudgetCents: number
) {
  const capCents = Math.floor(weeklyBudgetCents * 0.25);
  const eligibleCats = ["cleaning","paper_goods","personal_care","beverages","snacks","frozen","breakfast"];

  // pick top from at least 3 categories
  const picks: Offer[] = [];
  for (const cat of eligibleCats) {
    const o = pickTop(offers, cat);
    if (o) picks.push(o);
    if (picks.map(x => x.category).filter(Boolean).reduce((s,c)=>s.add(c!), new Set()).size >= 3) break;
  }

  const distinctCats = new Set(picks.map(p=>p.category).filter(Boolean) as string[]);
  const warning_banner = distinctCats.size < 3
    ? "Closest Possible — not enough household categories this week"
    : null;

  return {
    stack_type: "household",
    week_of,
    budget_cents: capCents,
    items: picks.slice(0,10),
    min_categories_required: 3,
    warning_banner
  };
}

const ESSENTIAL_CATS = ["cleaning", "paper_goods", "personal_care"] as const;

/** 7 dinners + 1 household essentials stack (toiletries/cleaning focus). */
export function generateSevenPlusOneBundle(
  offers: Offer[],
  week_of: string,
  weeklyBudgetCents: number,
  mode: "budget" | "quick" | "chef"
) {
  const mealBudgetCents = Math.floor(weeklyBudgetCents * 0.28);
  const perDinnerCapCents = Math.floor(mealBudgetCents / 7);
  const householdCapCents = Math.floor(weeklyBudgetCents * 0.12);

  const pickBudget = (cat: string) =>
    offers
      .filter((o) => o.category === cat)
      .slice()
      .sort(
        (a, b) =>
          (estimateLineCents(a) || 1e9) - (estimateLineCents(b) || 1e9)
      )[0];

  const pickChef = (cat: string) => pickTop(offers, cat);

  const pickQuick = (slot: number, cats: string[]) => {
    const cat = cats[slot % cats.length];
    const pool = offers.filter((o) => o.category === cat);
    if (!pool.length) return undefined;
    return pool.sort((a, b) => score(b) - score(a))[0];
  };

  const dinners = [1, 2, 3, 4, 5, 6, 7].map((slot) => {
    let protein: Offer | undefined;
    let starch: Offer | undefined;
    let veg: Offer | undefined;

    if (mode === "budget") {
      protein = pickBudget("protein");
      starch = pickBudget("starch") ?? pickBudget("breakfast");
      veg = pickBudget("vegetable") ?? pickBudget("frozen");
    } else if (mode === "chef") {
      protein = pickChef("protein");
      starch = pickChef("starch") ?? pickChef("breakfast");
      veg = pickChef("vegetable") ?? pickChef("frozen");
    } else {
      protein = pickQuick(slot, ["protein"]);
      starch = pickQuick(slot + 1, ["starch", "breakfast"]);
      veg = pickQuick(slot + 2, ["vegetable", "frozen"]);
    }

    const warnings: string[] = [];
    if (!protein) warnings.push("Missing protein");
    if (!starch) warnings.push("Missing starch");
    if (!veg) warnings.push("Missing vegetable");

    return {
      slot,
      servings: 6,
      per_dinner_cap_cents: perDinnerCapCents,
      items: [protein, starch, veg].filter(Boolean),
      warning_banner:
        warnings.length && mode !== "quick"
          ? "Closest Possible — limited deals this week"
          : null,
    };
  });

  const essentialPicks: Offer[] = [];
  for (const cat of ESSENTIAL_CATS) {
    const pool = offers.filter((o) => o.category === cat);
    const sorted =
      mode === "budget"
        ? pool.slice().sort((a, b) => estimateLineCents(a) - estimateLineCents(b))
        : mode === "chef"
          ? pool.slice().sort((a, b) => score(b) - score(a))
          : pool.slice().sort((a, b) => score(b) - score(a));
    const o = sorted[0];
    if (o) essentialPicks.push(o);
  }

  const household_essentials = {
    label: "Household Essentials",
    stack_type: "household_essentials" as const,
    week_of,
    budget_cents: householdCapCents,
    categories: [...ESSENTIAL_CATS],
    items: essentialPicks.slice(0, 8),
    warning_banner:
      essentialPicks.length < 2
        ? "Closest Possible — limited household essentials this week"
        : null,
  };

  return {
    week_of,
    mode,
    budget_cents: mealBudgetCents + householdCapCents,
    dinners,
    household_essentials,
  };
}

export function estimateLineCents(o: Offer): number {
  const unit = o.deal_price ?? o.regular_price ?? 0;
  const qty = Math.max(1, o.required_qty || 1);
  return Math.round(unit * 100 * qty);
}
