import { supabase } from "./supabase";

export async function completeTripAndPledge({
  week_of,
  budget_cents,
  spent_cents,
  verified_savings_cents,
  estimated_savings_cents,
  autoDonateEnabled,
}: {
  week_of: string;
  budget_cents: number;
  spent_cents: number;
  verified_savings_cents: number;
  estimated_savings_cents: number;
  autoDonateEnabled: boolean;
}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not signed in");

  const user_id = session.user.id;

  // 1) Create trip
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .insert({
      user_id,
      week_of,
      budget_cents,
      spent_cents,
      verified_savings_cents,
      estimated_savings_cents
    })
    .select()
    .single();

  if (tripErr) throw tripErr;

  // 2) Optional donation pledge (verified only)
  if (autoDonateEnabled && verified_savings_cents > 0) {
    const pledge_cents = Math.floor(verified_savings_cents * 0.05);

    await supabase.from("donation_pledges").insert({
      user_id,
      trip_id: trip.id,
      charity_key: "charity_of_month",
      verified_savings_cents,
      pledge_cents
    });
  }

  return trip;
}
