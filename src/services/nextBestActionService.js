import { supabase } from '../../lib/supabase';

// ── Action constants ──────────────────────────────────────────────────────────
export const NBA_ACTIONS = {
  RESUME_ONBOARDING:             'RESUME_ONBOARDING',
  START_WEEKLY_PLAN:             'START_WEEKLY_PLAN',
  REVIEW_PLAN:                   'REVIEW_PLAN',
  CONTINUE_SHOPPING_OR_RECEIPT:  'CONTINUE_SHOPPING_OR_RECEIPT',
  COMPLETE_TRIP_FEEDBACK:        'COMPLETE_TRIP_FEEDBACK',
  VIEW_WEEKLY_INSIGHTS:          'VIEW_WEEKLY_INSIGHTS',
  HOME_DASHBOARD:                'HOME_DASHBOARD',
};

// Map action → root-stack route name
export const NBA_TO_ROUTE = {
  RESUME_ONBOARDING:            'Onboarding',
  START_WEEKLY_PLAN:            'SmartStart',
  REVIEW_PLAN:                  'SmartStart',
  CONTINUE_SHOPPING_OR_RECEIPT: 'SmartStart',
  COMPLETE_TRIP_FEEDBACK:       'SmartStart',
  VIEW_WEEKLY_INSIGHTS:         'SmartStart',
  HOME_DASHBOARD:               'MainApp',
};

// Human-readable labels used by SmartStartScreen to highlight the right card
export const NBA_LABELS = {
  RESUME_ONBOARDING:            'Finish your setup',
  START_WEEKLY_PLAN:            'Build this week\'s grocery plan',
  REVIEW_PLAN:                  'Your plan is ready — review it',
  CONTINUE_SHOPPING_OR_RECEIPT: 'Continue shopping or check in',
  COMPLETE_TRIP_FEEDBACK:       'Answer 3 quick trip questions',
  VIEW_WEEKLY_INSIGHTS:         'See your weekly insights',
  HOME_DASHBOARD:               'View your dashboard',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart() {
  const now = new Date();
  const diff = now.getDate() - now.getDay(); // Sunday = 0
  const sunday = new Date(now);
  sunday.setDate(diff);
  sunday.setHours(0, 0, 0, 0);
  return sunday.toISOString();
}

async function safe(fn) {
  try { return await fn(); } catch { return null; }
}

// ── Individual state checks ───────────────────────────────────────────────────

async function checkOnboardingComplete(userId) {
  const data = await safe(() =>
    supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('user_id', userId)
      .single()
      .then(r => r.data)
  );
  // Default true — avoids redirect loop when column doesn't exist yet
  return data?.onboarding_complete ?? true;
}

async function checkActiveWeeklyPlan(userId) {
  const weekStart = getWeekStart();
  const data = await safe(() =>
    supabase
      .from('weekly_plans')
      .select('id')
      .eq('user_id', userId)
      .gte('week_start', weekStart)
      .in('status', ['active', 'draft'])
      .maybeSingle()
      .then(r => r.data)
  );
  return !!data;
}

async function checkCartStarted(userId) {
  const data = await safe(() =>
    supabase
      .from('cart_items')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .then(r => r.data)
  );
  return (data?.length ?? 0) > 0;
}

async function checkReceiptUploaded(userId) {
  const weekStart = getWeekStart();
  const data = await safe(() =>
    supabase
      .from('receipts')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', weekStart)
      .limit(1)
      .then(r => r.data)
  );
  return (data?.length ?? 0) > 0;
}

async function checkTripFeedbackCompleted(userId) {
  const weekStart = getWeekStart();
  const data = await safe(() =>
    supabase
      .from('trip_feedback')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', weekStart)
      .limit(1)
      .then(r => r.data)
  );
  return (data?.length ?? 0) > 0;
}

// ── Main router ───────────────────────────────────────────────────────────────

/**
 * Evaluates the user's current state and returns the next best action.
 *
 * @param {string} userId
 * @returns {Promise<{ action: string, route: string, label: string }>}
 */
export async function getNextBestAction(userId) {
  if (!userId) {
    return {
      action: NBA_ACTIONS.HOME_DASHBOARD,
      route: 'MainApp',
      label: NBA_LABELS.HOME_DASHBOARD,
    };
  }

  const [
    onboardingComplete,
    hasActivePlan,
    cartStarted,
    receiptUploaded,
    feedbackCompleted,
  ] = await Promise.all([
    checkOnboardingComplete(userId),
    checkActiveWeeklyPlan(userId),
    checkCartStarted(userId),
    checkReceiptUploaded(userId),
    checkTripFeedbackCompleted(userId),
  ]);

  let action;

  if (!onboardingComplete) {
    action = NBA_ACTIONS.RESUME_ONBOARDING;
  } else if (!hasActivePlan) {
    action = NBA_ACTIONS.START_WEEKLY_PLAN;
  } else if (!cartStarted) {
    action = NBA_ACTIONS.REVIEW_PLAN;
  } else if (!receiptUploaded) {
    action = NBA_ACTIONS.CONTINUE_SHOPPING_OR_RECEIPT;
  } else if (!feedbackCompleted) {
    action = NBA_ACTIONS.COMPLETE_TRIP_FEEDBACK;
  } else {
    action = NBA_ACTIONS.HOME_DASHBOARD;
  }

  return {
    action,
    route: NBA_TO_ROUTE[action] ?? 'MainApp',
    label: NBA_LABELS[action],
  };
}
