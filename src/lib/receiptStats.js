import { supabase } from "./supabase";

export async function countUserReceipts(userId) {
  const { count, error } = await supabase
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}
