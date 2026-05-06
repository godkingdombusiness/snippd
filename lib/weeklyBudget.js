import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL } from './supabase';

export const WEEKLY_BUDGET_UPDATED = 'snippd:weeklyBudgetUpdated';
export const WEEKLY_BUDGET_STORAGE_KEY = 'snippd_weekly_budget_cents';
const PLAN_CACHE_KEYS = [
  'cached_weekly_plan',
  'snippd_cached_weekly_plan',
  'snippd_weekly_plan_cache',
];

export async function fetchWeeklyBudgetCents(defaultCents = 15000) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return defaultCents;

    const { data: profile } = await supabase
      .from('profiles')
      .select('weekly_budget, preferences')
      .eq('user_id', user.id)
      .maybeSingle();

    const profileBudget = Number(profile?.weekly_budget);
    const prefBudget = Number(profile?.preferences?.weekly_budget_cents);
    if (profileBudget > 0) return Math.round(profileBudget);
    if (prefBudget > 0) return Math.round(prefBudget);
  } catch {}

  try {
    const cached = Number(await AsyncStorage.getItem(WEEKLY_BUDGET_STORAGE_KEY));
    if (cached > 0) return Math.round(cached);
  } catch {}

  return defaultCents;
}

export async function saveWeeklyBudgetEverywhere(weeklyBudgetCents) {
  const cents = Math.round(Number(weeklyBudgetCents) || 0);
  if (cents <= 0) throw new Error('Enter a weekly budget greater than $0.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No active user');

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('user_id', user.id)
    .maybeSingle();

  const profilePayload = {
    weekly_budget: cents,
    preferences: {
      ...(existingProfile?.preferences || {}),
      weekly_budget_cents: cents,
    },
    updated_at: new Date().toISOString(),
  };

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update(profilePayload)
    .eq('user_id', user.id)
    .select('user_id')
    .maybeSingle();

  if (updateError) throw updateError;

  if (!updatedProfile) {
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...profilePayload }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;
  }

  await Promise.allSettled([
    supabase.from('user_preferences').upsert({
      user_id: user.id,
      budget_range: Math.round(cents / 100),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }),
    supabase.from('budgets').upsert({
      user_id: user.id,
      weekly_budget_cents: cents,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }),
    AsyncStorage.setItem(WEEKLY_BUDGET_STORAGE_KEY, String(cents)),
    ...PLAN_CACHE_KEYS.map(key => AsyncStorage.removeItem(key)),
  ]);

  DeviceEventEmitter.emit(WEEKLY_BUDGET_UPDATED, cents);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && SUPABASE_URL) {
      fetch(`${SUPABASE_URL}/functions/v1/get-weekly-plan?refresh=true`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
  } catch {}

  return cents;
}
