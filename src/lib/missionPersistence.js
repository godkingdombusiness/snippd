import { supabase } from "./supabase";

/**
 * Supabase table: current_mission
 * - user_id (uuid, PK)
 * - payload (jsonb) — full active_mission document
 * - updated_at (timestamptz)
 */
export async function loadCurrentMission(userId) {
  const { data, error } = await supabase
    .from("current_mission")
    .select("payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.payload ?? null;
}

export async function saveCurrentMission(userId, payload) {
  const row = {
    user_id: userId,
    payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("current_mission").upsert(row, {
    onConflict: "user_id",
  });

  if (error) throw error;
}
