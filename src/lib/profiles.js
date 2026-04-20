import { supabase } from "./supabase";

export async function fetchPreferredStores(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_stores")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  const raw = data?.preferred_stores;
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object" && Array.isArray(raw.stores)) {
    return raw.stores.map(String);
  }
  return [];
}
