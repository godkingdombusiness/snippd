/**
 * Snippd behavioral-intelligence client SDK.
 *
 * Call sites emit typed events; this module POSTs them to the
 * `ingest-behavior` Supabase Edge Function, which writes them to the
 * Neo4j Aura graph. The graph powers personalization (store ranking,
 * product recommendations, Chef strategy tuning, savings hero).
 *
 * Every call here is:
 *   - **Fire-and-forget** — the returned promise resolves regardless of
 *     network outcome. Behavioral telemetry must never block the UI.
 *   - **Fail-silent** — if the endpoint is misconfigured, offline, or the
 *     Edge Function responds 5xx, we log a debug warning (wired through
 *     Sentry breadcrumbs) and continue.
 *   - **Idempotent on the server side** — replaying an event upserts the
 *     same node/relationship pair; no duplicate-writes to worry about.
 *
 * See `.snippd/neo4j-schema.cypher` for the graph schema and
 * `supabase/functions/ingest-behavior/index.ts` for the Cypher per event
 * type. The event `type` strings in EVENT_TYPES MUST stay in lockstep
 * with the TEMPLATES map in the Edge Function.
 */

import * as Sentry from "@sentry/react";

const INGEST_URL =
  import.meta.env.VITE_SNIPPD_BEHAVIOR_URL ||
  (import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL.replace(
        /^https?:\/\//,
        "https://"
      ).replace(/\.supabase\.co.*$/, ".functions.supabase.co")}/ingest-behavior`
    : "");

export const EVENT_TYPES = Object.freeze({
  USER_SIGNED_IN: "user.signed_in",
  PLAN_BUNDLE_LOCKED: "plan.bundle_locked",
  SHOP_ITEM_UNAVAILABLE: "shop.item_unavailable",
  TRIP_COMPLETED: "trip.completed",
  PREFERENCE_RECORDED: "preference.recorded",
});

/**
 * Session IDs persist for the life of a tab. They're used to group a
 * user's activity within one browsing session for funnel analysis and
 * to dedupe SIGNED_IN events across route transitions.
 */
const SESSION_STORAGE_KEY = "snippd.behavior.session";

function getOrCreateSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

export function currentSessionId() {
  return getOrCreateSessionId();
}

/**
 * Low-level send. Prefer one of the typed emit helpers below.
 *
 * @param {string} type    — event type from EVENT_TYPES.
 * @param {object} payload — event-specific fields. Must include user_id.
 * @returns {Promise<{status: string}>} — always resolves; never throws.
 */
export async function trackEvent(type, payload) {
  if (!type || !payload || !payload.user_id) {
    console.debug("[behavior] skipping: missing type or user_id", { type });
    return { status: "skipped", reason: "invalid" };
  }
  if (!INGEST_URL) {
    console.debug("[behavior] skipping: no ingest URL configured");
    return { status: "skipped", reason: "unconfigured" };
  }

  const body = { type, at: new Date().toISOString(), ...payload };

  // Breadcrumb in Sentry so when something else crashes we can see what
  // the user was doing; also useful when tuning the Cypher templates.
  try {
    Sentry.addBreadcrumb({
      category: "behavior",
      type: "info",
      level: "info",
      message: type,
      data: { user_id: payload.user_id, session_id: payload.session_id },
    });
  } catch {
    // Sentry might not be initialized in tests/dev; ignore.
  }

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // keepalive lets events fire during navigation away (e.g. trip
      // completed -> redirect to plan). 64KB max per spec, we're far below.
      keepalive: true,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.debug(`[behavior] ${type} → ${res.status} ${detail.slice(0, 120)}`);
      return { status: "failed", code: res.status };
    }
    const json = await res.json().catch(() => ({}));
    return { status: json.status || "accepted" };
  } catch (err) {
    // Network error — breadcrumb it and move on. Do NOT Sentry-capture
    // here; it would spam errors from users on flaky mobile connections.
    console.debug(`[behavior] ${type} → network error: ${err?.message || err}`);
    return { status: "failed", reason: "network" };
  }
}

/**
 * Emitted once per fresh tab / login cycle. Idempotent on the server:
 * replaying just updates lastSeenAt.
 */
export function emitUserSignedIn({ userId }) {
  return trackEvent(EVENT_TYPES.USER_SIGNED_IN, {
    user_id: userId,
    session_id: getOrCreateSessionId(),
  });
}

/**
 * Emitted when the user taps "Add to Cart" / "Lock this week" on the
 * plan screen and the mission provider persists the bundle.
 *
 * @param products array of `{ name, role }` where role is
 *                 "dinner" | "essential". Role is stored on the CONTAINS
 *                 relationship, not the product itself, because the same
 *                 product can play different roles in different weeks.
 */
export function emitBundleLocked({
  userId,
  bundleId,
  strategy,
  storeSlug,
  budgetCents,
  products,
}) {
  return trackEvent(EVENT_TYPES.PLAN_BUNDLE_LOCKED, {
    user_id: userId,
    session_id: getOrCreateSessionId(),
    bundle_id: bundleId,
    strategy,
    store_slug: storeSlug,
    budget_cents: budgetCents,
    products: Array.isArray(products) ? products : [],
  });
}

/**
 * Emitted when the user marks a list item as "item not found at this
 * store". This is the single biggest input to store-ranking: if your
 * Aldi keeps running out of the chicken thighs, that signal should
 * downrank Aldi for you specifically next week.
 */
export function emitItemUnavailable({
  userId,
  bundleId,
  storeSlug,
  productName,
  replacementName,
}) {
  return trackEvent(EVENT_TYPES.SHOP_ITEM_UNAVAILABLE, {
    user_id: userId,
    session_id: getOrCreateSessionId(),
    bundle_id: bundleId,
    store_slug: storeSlug,
    product_name: productName,
    replacement_name: replacementName || null,
  });
}

/**
 * Emitted when the user finishes the Trip Wrap-up / Verify flow. This
 * is the headline metric event — "did Snippd actually save this user
 * money this week".
 */
export function emitTripCompleted({
  userId,
  bundleId,
  tripId,
  storeSlug,
  retailCents,
  ibottaCents,
  fetchCents,
  loyaltyCents,
  unplannedItems,
}) {
  return trackEvent(EVENT_TYPES.TRIP_COMPLETED, {
    user_id: userId,
    session_id: getOrCreateSessionId(),
    bundle_id: bundleId,
    trip_id: tripId,
    store_slug: storeSlug,
    retail_cents: retailCents ?? 0,
    ibotta_cents: ibottaCents ?? 0,
    fetch_cents: fetchCents ?? 0,
    loyalty_cents: loyaltyCents ?? 0,
    unplanned_items: Array.isArray(unplannedItems) ? unplannedItems : [],
  });
}

/**
 * Emitted when the user answers the "save this preference for next
 * week" prompt on the verify screen. Replaces the former
 * src/lib/neo4jPreference.js call site.
 */
export function emitPreferenceRecorded({
  userId,
  storeSlug,
  sentiment,
  text,
  subjectProductNames,
}) {
  return trackEvent(EVENT_TYPES.PREFERENCE_RECORDED, {
    user_id: userId,
    session_id: getOrCreateSessionId(),
    store_slug: storeSlug,
    sentiment,
    text,
    subject_product_names: Array.isArray(subjectProductNames)
      ? subjectProductNames
      : [],
  });
}
