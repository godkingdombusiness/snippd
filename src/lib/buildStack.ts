import type { Offer } from "./fetchOffers";

export function buildSimpleMealStack(offers: Offer[]) {
  const pick = (cat: string) =>
    offers
      .filter(o => o.category === cat)
      .sort((a, b) => {
        // simple priority: bogo > sale > other
        const score = (o: Offer) =>
          (o.promo_type === "bogo" ? 1000 : 0) +
          (o.promo_type === "sale" ? 600 : 0);
        return score(b) - score(a);
      })[0];

  const protein = pick("protein");
  const starch = pick("starch");
  const veg = pick("vegetable");
  const dairy = pick("dairy");

  return [protein, starch, veg, dairy].filter(Boolean);
}
