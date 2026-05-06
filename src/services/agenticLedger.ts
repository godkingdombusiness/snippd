/**
 * AgenticLedger — immutable audit log for every autonomous agent decision.
 *
 * Every agentic action (plan build, hunt, anchor rejection, retailer failover,
 * budget save, drift detection) writes a row to `agentic_ledger`.  The table
 * is INSERT-only (enforced by RLS).  Rows are replicated to Neo4j nightly.
 *
 * Usage:
 *   import { AgenticLedger, DecisionType } from '../services/agenticLedger';
 *
 *   await AgenticLedger.log({
 *     decision_type: DecisionType.ANCHOR_REJECT,
 *     actor: 'DeterministicAnchor',
 *     result: 'rejected',
 *     metadata: { sku_id: 'abc', delta_cents: 300 },
 *   });
 *
 * Failures are non-fatal — a console.warn is emitted but the calling code
 * is never interrupted by a ledger write failure.
 */

import { supabase } from '../../lib/supabase';

// ── Decision type registry ────────────────────────────────────────────────────

export const DecisionType = {
  // DeterministicAnchor
  ANCHOR_APPROVE:      'ANCHOR_APPROVE',
  ANCHOR_REJECT:       'ANCHOR_REJECT',

  // Hunt / DiscoverScreen
  HUNT_SANITIZE:       'HUNT_SANITIZE',        // query cleaned before use
  HUNT_RESULT:         'HUNT_RESULT',           // n deals returned

  // RetailerWrapper
  RETAILER_TIER:       'RETAILER_TIER',         // which tier served data

  // Plan
  PLAN_BUILD:          'PLAN_BUILD',            // plan constructed / loaded
  PLAN_LOCK_IN:        'PLAN_LOCK_IN',          // user locked in the plan

  // Budget
  BUDGET_SAVE:         'BUDGET_SAVE',           // user changed weekly_budget
  DRIFT_DETECTED:      'DRIFT_DETECTED',        // strategic drift modal shown

  // Clip session
  CLIP_SESSION_START:  'CLIP_SESSION_START',
  CLIP_SESSION_SUBMIT: 'CLIP_SESSION_SUBMIT',

  // Premium Concierge (client flow — replicated to Neo4j via ledger pipeline)
  CONCIERGE_ADD_TO_CART:     'CONCIERGE_ADD_TO_CART',
  CONCIERGE_CLIP_STEP:       'CONCIERGE_CLIP_STEP',
  CONCIERGE_LIST_STOCK_SWAP: 'CONCIERGE_LIST_STOCK_SWAP',
  CONCIERGE_CHECKOUT_VIEW:   'CONCIERGE_CHECKOUT_VIEW',
  STASH_INSIGHT_VIEW:        'STASH_INSIGHT_VIEW',
  UNPLANNED_ITEM_OPT_IN:     'UNPLANNED_ITEM_OPT_IN',

  // Waitlist & Onboarding funnel
  FORECAST_COMPLETED:         'FORECAST_COMPLETED',         // user completes initial savings forecast
  WAITLIST_ACTION_RECORDED:   'WAITLIST_ACTION_RECORDED',   // user completes a gamified waitlist action

  // Generic
  INFO:                'INFO',
} as const;

export type DecisionTypeValue = (typeof DecisionType)[keyof typeof DecisionType];

// ── Payload hash ──────────────────────────────────────────────────────────────

/**
 * Produces a compact hex digest of any JSON-serialisable payload using
 * the Web Crypto API (SHA-256).  Returns null gracefully on failure.
 */
async function hashPayload(payload: unknown): Promise<string | null> {
  try {
    const enc  = new TextEncoder();
    const buf  = await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

// ── Ledger entry shape ────────────────────────────────────────────────────────

export interface LedgerEntry {
  decision_type: DecisionTypeValue | string;
  actor: string;
  result?: 'approved' | 'rejected' | 'fallback' | 'error' | 'info';
  metadata?: Record<string, unknown>;
  /** Optional: pass a pre-fetched user_id to skip the auth.getUser() call */
  user_id?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const AgenticLedger = {

  /**
   * Appends an immutable row to `agentic_ledger`.
   * Always resolves (never rejects) — write failures are non-fatal.
   */
  async log(entry: LedgerEntry): Promise<void> {
    try {
      let uid = entry.user_id;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
      }
      if (!uid) return; // not signed in — skip silently

      const payload_hash = await hashPayload(entry.metadata ?? null);

      const { error } = await supabase.from('agentic_ledger').insert({
        user_id:       uid,
        decision_type: entry.decision_type,
        actor:         entry.actor,
        result:        entry.result ?? 'info',
        payload_hash,
        metadata:      entry.metadata ?? {},
      });

      if (error) {
        console.warn('[AgenticLedger] insert failed:', error.message, { decision_type: entry.decision_type, actor: entry.actor });
      }
    } catch (err: any) {
      console.warn('[AgenticLedger] unexpected error:', err?.message ?? err, { decision_type: entry.decision_type, actor: entry.actor });
    }
  },

  /**
   * Convenience: log a DeterministicAnchor decision without boilerplate.
   */
  async logAnchor(opts: {
    user_id?: string;
    result: 'approved' | 'rejected';
    sku_id: string;
    sku_name: string;
    price_cents: number;
    remaining_cents: number;
  }): Promise<void> {
    await AgenticLedger.log({
      user_id:       opts.user_id,
      decision_type: opts.result === 'approved' ? DecisionType.ANCHOR_APPROVE : DecisionType.ANCHOR_REJECT,
      actor:         'DeterministicAnchor',
      result:        opts.result,
      metadata: {
        sku_id:          opts.sku_id,
        sku_name:        opts.sku_name,
        price_cents:     opts.price_cents,
        remaining_cents: opts.remaining_cents,
        delta_cents:     opts.price_cents - opts.remaining_cents,
      },
    });
  },

  /**
   * Convenience: log a RetailerWrapper tier selection.
   */
  async logRetailerTier(opts: {
    user_id?: string;
    tier: string;
    deal_count: number;
    latency_ms: number;
    error?: string;
  }): Promise<void> {
    await AgenticLedger.log({
      user_id:       opts.user_id,
      decision_type: DecisionType.RETAILER_TIER,
      actor:         'RetailerWrapper',
      result:        opts.error ? 'error' : (opts.tier === 'instacart' ? 'approved' : 'fallback'),
      metadata: {
        tier:        opts.tier,
        deal_count:  opts.deal_count,
        latency_ms:  opts.latency_ms,
        error:       opts.error ?? null,
      },
    });
  },
};
