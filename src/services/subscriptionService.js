/**
 * subscriptionService — lightweight subscription status helper.
 *
 * Primary source of truth: Supabase profiles.subscription_status
 * (kept in sync by the stripe-webhook edge function).
 *
 * This service is read-only on the client.
 * All writes go through the stripe-webhook edge function.
 */

import { supabase } from '../../lib/supabase';

var ACTIVE_STATUSES  = ['active', 'trialing'];
var LAPSED_STATUSES  = ['past_due', 'cancelled', 'none'];

async function safe(fn) {
  try { return await fn(); } catch { return null; }
}

/**
 * Full subscription snapshot for a user.
 *
 * @param {string} userId
 * @returns {{
 *   subscriptionStatus: string,
 *   billingPlan: string,
 *   trialEndsAt: string|null,
 *   subscriptionPeriodEnd: string|null,
 *   isActive: boolean,
 *   isTrialing: boolean,
 *   isPastDue: boolean,
 *   isCancelled: boolean,
 *   hasAccess: boolean,
 * }}
 */
export async function getSubscriptionSnapshot(userId) {
  if (!userId) {
    return _defaultSnapshot();
  }

  var data = await safe(function () {
    return supabase
      .from('profiles')
      .select('subscription_status, billing_plan, trial_ends_at, subscription_period_end')
      .eq('user_id', userId)
      .single()
      .then(function (r) { return r.data; });
  });

  var status = data?.subscription_status || 'none';
  var plan   = data?.billing_plan || 'trial';

  return {
    subscriptionStatus:    status,
    billingPlan:           plan,
    trialEndsAt:           data?.trial_ends_at || null,
    subscriptionPeriodEnd: data?.subscription_period_end || null,
    isActive:              status === 'active',
    isTrialing:            status === 'trialing',
    isPastDue:             status === 'past_due',
    isCancelled:           status === 'cancelled',
    hasAccess:             ACTIVE_STATUSES.includes(status),
  };
}

/**
 * Quick boolean check — does this user have active access?
 */
export async function userHasAccess(userId) {
  var snap = await getSubscriptionSnapshot(userId);
  return snap.hasAccess;
}

/**
 * Returns a human-readable status label.
 */
export function formatSubscriptionStatus(status) {
  var labels = {
    active:    'Active',
    trialing:  'Free trial',
    past_due:  'Payment due',
    cancelled: 'Cancelled',
    none:      'No subscription',
  };
  return labels[status] || status || 'Unknown';
}

/**
 * Returns true if the user is in a lapsed (not active) state.
 */
export function isLapsedStatus(status) {
  return LAPSED_STATUSES.includes(status);
}

function _defaultSnapshot() {
  return {
    subscriptionStatus:    'none',
    billingPlan:           'trial',
    trialEndsAt:           null,
    subscriptionPeriodEnd: null,
    isActive:              false,
    isTrialing:            false,
    isPastDue:             false,
    isCancelled:           false,
    hasAccess:             false,
  };
}
