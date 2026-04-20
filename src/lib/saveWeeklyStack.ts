import { supabase } from "./supabase";

export async function saveWeeklyStack(user_id: string, week_of: string, stack_type: string, stack_json: any) {
  const truth_label = stack_json.warning_banner ? "EST_TOTAL" : "AD_PRICE";

  const { data, error } = await supabase
    .from("weekly_stacks")
    .insert({
      user_id,
      week_of,
      stack_type,
      stack_json,
      truth_label,
      warning_banner: stack_json.warning_banner ?? null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
