/**
 * paywallGateService — determines whether a user needs to see the paywall
 * before taking a high-value action (first shop, first plan, etc.).
 *
 * The paywall appears AFTER onboarding + personality completion,
 * when the user taps "Begin My First Shop" for the first time.
 *
 * It does NOT appear:
 * - During sign-up
 * - Before onboarding
 * - When subscription_status is active or trialing
 * - For demo/admin users
 * - When accessing saved recipes or basic free history
 */

import { supabase } from '../../lib/supabase';

var ACTIVE_STATUSES = ['active', 'trialing'];

async function safe(fn) {
  try { return await fn(); } catch { return null; }
}

/**
 * Load the user's subscription state from profiles.
 * Returns { subscriptionStatus, billingPlan, trialEndsAt } or defaults.
 */
export async function getSubscriptionState(userId) {
  if (!userId) return { subscriptionStatus: 'none', billingPlan: 'trial', trialEndsAt: null };

  var data = await safe(function () {
    return supabase
      .from('profiles')
      .select('subscription_status, billing_plan, trial_ends_at, onboarding_complete, onboarding_completed')
      .eq('user_id', userId)
      .single()
      .then(function (r) { return r.data; });
  });

  return {
    subscriptionStatus: data?.subscription_status || 'none',
    billingPlan:        data?.billing_plan || 'trial',
    trialEndsAt:        data?.trial_ends_at || null,
    onboardingComplete: !!(data?.onboarding_complete || data?.onboarding_completed),
  };
}

/**
 * Check whether the user has active access (no paywall needed).
 * Returns true if subscription_status is active or trialing.
 */
export async function hasActiveAccess(userId) {
  var state = await getSubscriptionState(userId);
  return ACTIVE_STATUSES.includes(state.subscriptionStatus);
}

/**
 * Primary gate: call this when user taps "Begin My First Shop" or similar.
 *
 * Returns:
 *   { allowed: true }                              — proceed to first shop
 *   { allowed: false, nextRoute: 'FirstShopPaywall', nextParams: {...} }
 *                                                  — show paywall first
 *
 * @param {string} userId
 * @param {string} intendedRoute   — the route to go to after payment ('TodaySetupGate', etc.)
 * @param {object} intendedParams  — params to pass to that route
 */
export async function checkFirstShopAccess(userId, intendedRoute, intendedParams) {
  var active = await hasActiveAccess(userId);
  if (active) {
    return { allowed: true };
  }
  return {
    allowed: false,
    nextRoute: 'FirstShopPaywall',
    nextParams: {
      intendedRoute:  intendedRoute  || 'TodaySetupGate',
      intendedParams: intendedParams || {},
    },
  };
}

/**
 * Persist where the user was trying to go when the paywall appeared.
 * This is read by PaymentSuccessRedirectScreen to route automatically.
 */
export async function saveNextRouteAfterPayment(userId, route, params) {
  if (!userId) return;
  await safe(function () {
    return supabase
      .from('profiles')
      .update({ next_route_after_payment: JSON.stringify({ route: route, params: params || {} }) })
      .eq('user_id', userId);
  });
}

/**
 * Read and clear the pending post-payment route.
 * Returns { route, params } or null.
 */
export async function consumeNextRouteAfterPayment(userId) {
  if (!userId) return null;

  var data = await safe(function () {
    return supabase
      .from('profiles')
      .select('next_route_after_payment')
      .eq('user_id', userId)
      .single()
      .then(function (r) { return r.data; });
  });

  var raw = data?.next_route_after_payment;
  if (!raw) return null;

  // Clear it so it doesn't fire again
  await safe(function () {
    return supabase
      .from('profiles')
      .update({ next_route_after_payment: null })
      .eq('user_id', userId);
  });

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Determine the correct redirect route after a successful payment or trial activation.
 *
 * Priority:
 * 1. next_route_after_payment (saved when paywall was shown)
 * 2. TodaySetupGate if profile details are missing
 * 3. TodayOptionsRanked as default
 *
 * @param {string} userId
 * @param {object} profileData  — optional pre-loaded profile snapshot
 */
export async function handlePostPurchaseRedirect(userId, profileData) {
  // 1. Check stored intent
  var saved = await consumeNextRouteAfterPayment(userId);
  if (saved?.route) {
    return { route: saved.route, params: saved.params || {} };
  }

  // 2. Check if Today setup is complete
  var profile = profileData || await safe(function () {
    return supabase
      .from('profiles')
      .select('weekly_budget, household_size')
      .eq('user_id', userId)
      .single()
      .then(function (r) { return r.data; });
  });

  var setupComplete = !!(profile?.weekly_budget && profile?.household_size);
  if (!setupComplete) {
    return { route: 'TodaySetupGate', params: {} };
  }

  return { route: 'TodayOptionsRanked', params: {} };
}

/**
 * Activate a mock trial (for demo / pre-Stripe environments).
 * Sets subscription_status = 'trialing', trial_ends_at = now + 3 days.
 */
export async function activateMockTrial(userId) {
  if (!userId) return { success: false };
  var trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  var result = await safe(function () {
    return supabase
      .from('profiles')
      .update({
        subscription_status: 'trialing',
        billing_plan:        'trial',
        trial_ends_at:       trialEnd,
      })
      .eq('user_id', userId);
  });
  return { success: result !== null, trialEndsAt: trialEnd };
}
