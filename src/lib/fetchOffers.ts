import { supabase } from "./supabase";

export type Offer = {
  id: string;
  promo_type: string;
  category: string | null;
  headline: string;
  deal_price: number | null;
  regular_price: number | null;
  required_qty: number;
  /** When present, restricts an offer to a store slug (e.g. walmart, aldi). */
  store_key?: string | null;
};

export async function fetchActiveOffers() {
  const { data, error } = await supabase
    .from("v_active_offers")
    .select("*");

  if (error) throw error;
  return data ?? [];
}
