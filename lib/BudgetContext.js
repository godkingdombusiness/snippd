/**
 * BudgetContext — single source of truth for weekly_budget_cents.
 *
 * All screens (Home, Plan, Profile) subscribe via useBudget().
 * Budget changes propagate instantly: saving in HomeScreen or ProfileScreen
 * calls broadcastBudgetChange(cents) which updates every subscriber and
 * invalidates the local AsyncStorage plan cache so WeeklyPlanScreen
 * triggers a fresh load on its next render.
 *
 * Provides:
 *   weeklyBudgetCents   — integer cents | null (null = not yet fetched from DB)
 *   budgetResolved      — true once refreshBudget() has completed at least once
 *   refreshBudget()     — fetch from profiles table and update context
 *   broadcastBudgetChange(cents) — update context, invalidate caches, fire restack
 *
 * WeeklyPlanScreen derives:
 *   effectiveBudget = weeklyBudgetCents ?? DEFAULT_WEEKLY_BUDGET_CENTS
 * so all math is safe even before the first DB round-trip completes.
 * If budgetResolved === true and weeklyBudgetCents is still null/0, the
 * user has no budget set — WeeklyPlanScreen shows a "Please set your budget"
 * prompt.
 */

import React, {
  createContext, useContext, useState, useCallback, useRef, useEffect,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL } from './supabase';
import { fetchWeeklyBudgetCents, saveWeeklyBudgetEverywhere } from './weeklyBudget';

export const DEFAULT_BUDGET_CENTS = 15000; // $150 fallback when null
const PLAN_CACHE_KEY = 'cached_weekly_plan';

const BudgetContext = createContext(null);

export const useBudget = () => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within a BudgetProvider');
  return ctx;
};

export const BudgetProvider = ({ children }) => {
  // null = "not yet fetched"; 0 = "fetched, user has no budget set"
  const [weeklyBudgetCents, setWeeklyBudgetCents] = useState(null);
  // Becomes true after the first refreshBudget() completes (success or failure)
  const [budgetResolved, setBudgetResolved] = useState(false);
  // Guard against duplicate in-flight refreshes
  const refreshing = useRef(false);
  // Prevent state updates if the provider unmounts mid-fetch
  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  /**
   * Pull the current budget from the DB and update context.
   * Safe to call multiple times — debounced by in-flight guard.
   * Sets budgetResolved = true after first completion regardless of outcome.
   */
  const refreshBudget = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const cents = await fetchWeeklyBudgetCents(0);
      // Set to fetched value (may be 0 or null if user never saved a budget)
      if (isMounted.current) {
        setWeeklyBudgetCents(cents > 0 ? cents : 0);
      }
    } catch { /* non-critical — budgetResolved still flips */ }
    finally {
      if (isMounted.current) setBudgetResolved(true);
      refreshing.current = false;
    }
  }, []);

  /**
   * Persist a new budget, update context, invalidate caches, fire restack.
   * Called by HomeScreen.handleBudgetPivot and ProfileScreen.saveBudget
   * after the DB write succeeds — they own the DB write; this owns propagation.
   */
  const broadcastBudgetChange = useCallback(async (cents) => {
    if (!cents || cents <= 0) return;
    await saveWeeklyBudgetEverywhere(cents);
    // 1. Update context immediately — all subscribers re-render at once
    setWeeklyBudgetCents(cents);
    setBudgetResolved(true);
    // 2. Invalidate local plan cache so WeeklyPlanScreen reloads fresh plan
    try { await AsyncStorage.removeItem(PLAN_CACHE_KEY); } catch { /* ok */ }
    // 3. Fire-and-forget restack so the new plan is ready when Plan tab opens
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(`${SUPABASE_URL}/functions/v1/get-weekly-plan?refresh=true`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      }
    } catch { /* ok */ }
  }, []);

  return (
    <BudgetContext.Provider
      value={{ weeklyBudgetCents, budgetResolved, refreshBudget, broadcastBudgetChange }}
    >
      {children}
    </BudgetContext.Provider>
  );
};
