import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export type Offer = {
  category: string | null;
  deal_price: number | null;
  regular_price: number | null;
  promo_type: string;
  required_qty: number;
};

export async function fetchActiveOffers() {
  const { data, error } = await supabase
    .from("v_active_offers")
    .select("*");

  if (error) throw error;
  return data ?? [];
}

export function buildSimpleMealStack(offers: Offer[]) {
  const protein = offers.find(o => o.category === "protein");
  const starch = offers.find(o => o.category === "starch");
  const veg = offers.find(o => o.category === "vegetable");
  const dairy = offers.find(o => o.category === "dairy");

  return [protein, starch, veg, dairy].filter(Boolean);
}


