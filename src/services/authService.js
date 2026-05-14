/**
 * authService — centralized authentication service for Snippd.
 *
 * Auth provider: Supabase Auth (OAuth 2.0, PKCE flow for mobile).
 * Google sign-in uses Supabase's OAuth provider with expo-web-browser.
 * Apple sign-in available on iOS via Supabase OAuth.
 *
 * Required env vars:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   (App scheme "snippd" configured in app.json for deep-link redirect)
 *
 * Supabase dashboard config required:
 *   - Google OAuth provider enabled
 *   - Redirect URL: snippd://auth/callback
 *   - Google Cloud Console: OAuth client with the redirect URI above
 *
 * All functions return { data, error } so callers can handle errors.
 */

import { supabase } from '../../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import { tracker } from '../lib/eventTracker';

// Ensure auth sessions opened in in-app browser complete correctly on Android
WebBrowser.maybeCompleteAuthSession();

var REDIRECT_URI = makeRedirectUri({ scheme: 'snippd', path: 'auth/callback' });

// ── Safe wrapper ───────────────────────────────────────────────────────────────
async function safe(fn) {
  try { return await fn(); } catch (e) { return { data: null, error: e }; }
}

// ── Auth operations ────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(email, password) {
  tracker.track('email_signin_started', {});
  var result = await safe(function () {
    return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: password });
  });
  if (result?.data?.session) {
    tracker.track('email_signin_success', {});
    if (result.data.session.access_token) {
      tracker.setAccessToken(result.data.session.access_token);
      tracker.setDefaultUserId(result.data.user?.id);
    }
  } else if (result?.error) {
    tracker.track('email_signin_failed', { reason: result.error.message });
  }
  return result;
}

/**
 * Sign up with email and password.
 * Sets billing_plan = 'trial' by default on the profile.
 * Paywall is shown AFTER onboarding + personality, not here.
 */
export async function signUpWithEmail(email, password) {
  tracker.track('email_signup_started', {});
  var result = await safe(function () {
    return supabase.auth.signUp({ email: email.trim().toLowerCase(), password: password });
  });
  if (result?.data?.user) {
    // Create profile row with trial default
    await safe(function () {
      return supabase.from('profiles').upsert({
        user_id:      result.data.user.id,
        email:        result.data.user.email,
        billing_plan: 'trial',
      }, { onConflict: 'user_id', ignoreDuplicates: true });
    });
    if (result.data.session?.access_token) {
      tracker.setAccessToken(result.data.session.access_token);
      tracker.setDefaultUserId(result.data.user.id);
    }
    tracker.track('email_signup_success', {});
  }
  return result;
}

/**
 * Sign in with Google via Supabase OAuth + expo-web-browser.
 *
 * Flow:
 *  1. Get OAuth URL from Supabase
 *  2. Open in-app browser
 *  3. Browser redirects to snippd://auth/callback
 *  4. Exchange code for session
 *  5. App.js onAuthStateChange handles routing
 */
export async function signInWithGoogle() {
  tracker.track('google_signin_started', {});
  try {
    var { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:          REDIRECT_URI,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('Google sign-in is not configured yet.');

    var result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URI);

    if (result.type === 'cancel') {
      tracker.track('google_signin_canceled', {});
      return { data: null, error: new Error('Google sign-in was canceled.') };
    }

    if (result.type === 'success' && result.url) {
      var { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (exchangeError) throw exchangeError;
      tracker.track('google_signin_success', {});
      return { data: { provider: 'google' }, error: null };
    }

    return { data: null, error: new Error('Google sign-in did not complete. Please try again.') };
  } catch (err) {
    tracker.track('google_signin_failed', { reason: err.message });
    return { data: null, error: err };
  }
}

/**
 * Sign in with Apple (iOS only).
 */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    return { data: null, error: new Error('Apple sign-in is only available on iOS.') };
  }
  tracker.track('apple_signin_started', {});
  try {
    var { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: REDIRECT_URI, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Apple sign-in is not configured.');

    var result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URI);
    if (result.type === 'cancel') {
      return { data: null, error: new Error('Apple sign-in was canceled.') };
    }
    if (result.type === 'success' && result.url) {
      var { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (exchangeError) throw exchangeError;
      tracker.track('apple_signin_success', {});
      return { data: { provider: 'apple' }, error: null };
    }
    return { data: null, error: new Error('Apple sign-in did not complete. Please try again.') };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Sign out.
 */
export async function signOut() {
  await safe(function () {
    return supabase.auth.signOut({ scope: 'global' });
  });
}

/**
 * Send a password reset email.
 */
export async function resetPassword(email) {
  tracker.track('forgot_password_clicked', {});
  return safe(function () {
    return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  });
}

/**
 * Get the currently authenticated user.
 * Returns user object or null.
 */
export async function getCurrentUser() {
  var result = await safe(function () {
    return supabase.auth.getUser();
  });
  return result?.data?.user ?? null;
}

/**
 * Load the user's profile from Supabase.
 */
export async function getUserProfile(userId) {
  var result = await safe(function () {
    return supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
  });
  return result?.data ?? null;
}

/**
 * Determine the correct post-auth route based on user state.
 *
 * Checks (in order):
 *  1. onboarding_complete / onboarding_completed
 *  2. subscription_status (active/trialing → skip paywall)
 *  3. first_shop_started
 *  4. weekly_budget + household_size for Today setup
 *
 * Returns a route name string.
 */
export async function getAuthRedirectRoute(userId) {
  if (!userId) return 'Auth';

  var profile = await getUserProfile(userId);

  // Step 1: Has the user completed onboarding?
  var onboardingDone = !!(profile?.onboarding_complete || profile?.onboarding_completed);
  if (!onboardingDone) return 'Onboarding';

  // Step 2: Check subscription status
  var subStatus = profile?.subscription_status || 'none';
  var hasAccess = ['active', 'trialing'].includes(subStatus);

  // Step 3: Has the user seen the personalization summary?
  var firstShopStarted = !!(profile?.first_shop_started);

  if (!hasAccess && !firstShopStarted) {
    // New paid user journey: show personalization summary → paywall when they tap Begin
    return 'PersonalizationSummary';
  }

  // Step 4: Check Snippd Deep Brief
  var personaResult = await safe(function () {
    return supabase
      .from('user_persona')
      .select('status, briefing_completed')
      .eq('user_id', userId)
      .maybeSingle();
  });
  var persona = personaResult?.data;
  if (persona?.status === 'launched' && !persona?.briefing_completed) {
    return 'ConciergeOnboarding';
  }

  // Step 5: Today setup
  var setupComplete = !!(profile?.weekly_budget && profile?.household_size);
  if (!setupComplete) return 'TodaySetupGate';

  return 'TodayOptionsRanked';
}

/**
 * Format an auth error into a user-friendly message.
 */
export function formatAuthError(error) {
  if (!error) return null;
  var msg = error.message || '';

  if (msg.includes('Invalid login credentials'))
    return 'We could not sign you in. Please check your email and password.';
  if (msg.includes('Email not confirmed'))
    return 'Please confirm your email address before signing in.';
  if (msg.includes('User already registered'))
    return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('canceled') || msg.includes('cancelled'))
    return 'Google sign-in was canceled.';
  if (msg.includes('not configured') || msg.includes('not fully configured'))
    return 'Google sign-in is not fully configured yet.';
  if (msg.includes('Network request failed') || msg.includes('fetch'))
    return 'Connection issue. Please check your internet and try again.';

  // Development mode: show raw error; production: generic message
  if (__DEV__) return msg;
  return 'Authentication failed. Please try again.';
}
