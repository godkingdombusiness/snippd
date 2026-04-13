/**
 * Snippd — SnippdEventTracker
 * Client SDK for React Native / Expo.
 *
 * Features:
 *  - Auto-batching queue (flush every 2.5 s or when 10 events accumulate)
 *  - Session management via setDefaultSessionId()
 *  - Retry with exponential backoff (up to 3 retries)
 *  - Typed convenience methods for all 40 tracked events
 *  - Singleton export `tracker`
 */

import type { EventName, InboundEvent } from '../types/events';

/** Internal type for partial events before prepare() fills in required fields */
type PartialEvent = Omit<InboundEvent, 'session_id'> & { session_id?: string };

// ─────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────

interface QueueItem {
  event: InboundEvent;
  retries: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getEndpoint(): string {
  const base = (
    (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_SUPABASE_URL) ||
    ''
  ).replace(/\/+$/, '');
  if (!base) throw new Error('EXPO_PUBLIC_SUPABASE_URL must be set');
  return `${base}/functions/v1/ingest-event`;
}

// ─────────────────────────────────────────────────────────────
// Tracker class
// ─────────────────────────────────────────────────────────────

class SnippdEventTracker {
  private token: string | null = null;
  private defaultUserId: string | null = null;
  private defaultSessionId: string | null = null;

  private queue: QueueItem[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  private readonly maxBatchSize = 10;
  private readonly flushIntervalMs = 2_500;
  private readonly maxRetries = 3;
  private readonly baseRetryDelayMs = 1_500;

  // ── Auth / session ────────────────────────────────────────

  setAccessToken(token: string): void {
    this.token = token;
  }

  setDefaultUserId(userId: string): void {
    this.defaultUserId = userId;
  }

  setDefaultSessionId(sessionId: string): void {
    this.defaultSessionId = sessionId;
  }

  // ── Core track ────────────────────────────────────────────

  trackEvent(event: InboundEvent): void {
    if (!this.token) {
      console.warn('[SnippdTracker] access token not set — event dropped');
      return;
    }
    this.enqueue(this.prepare(event));
  }

  trackBatch(events: InboundEvent[]): void {
    events.forEach((e) => this.enqueue(this.prepare(e)));
  }

  // ── Convenience methods ───────────────────────────────────

  private emit(event: PartialEvent): void {
    this.trackEvent(event as InboundEvent);
  }

  // App lifecycle
  trackAppOpened(meta?: Partial<InboundEvent>): void {
    this.emit({ ...meta, event_name: 'APP_OPENED', user_id: this.requireUserId(meta) });
  }
  trackAppClosed(meta?: Partial<InboundEvent>): void {
    this.emit({ ...meta, event_name: 'APP_CLOSED', user_id: this.requireUserId(meta) });
  }
  trackOnboardingCompleted(meta?: Partial<InboundEvent>): void {
    this.emit({ ...meta, event_name: 'ONBOARDING_COMPLETED', user_id: this.requireUserId(meta) });
  }

  // Item interactions
  trackItemViewed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'ITEM_VIEWED', object_type: 'item', user_id: this.requireUserId(payload) });
  }
  trackItemAddedToCart(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'ITEM_ADDED_TO_CART', object_type: 'item', user_id: this.requireUserId(payload) });
  }
  trackItemRemovedFromCart(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'ITEM_REMOVED_FROM_CART', object_type: 'item', user_id: this.requireUserId(payload) });
  }
  trackItemSubstituted(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'ITEM_SUBSTITUTED', object_type: 'item', user_id: this.requireUserId(payload) });
  }

  // Checkout
  trackCheckoutStarted(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'CHECKOUT_STARTED', user_id: this.requireUserId(payload) });
  }
  trackCheckoutCompleted(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'CHECKOUT_COMPLETED', user_id: this.requireUserId(payload) });
  }
  trackPurchaseCompleted(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'PURCHASE_COMPLETED', user_id: this.requireUserId(payload) });
  }
  trackReceiptUploaded(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'RECEIPT_UPLOADED', user_id: this.requireUserId(payload) });
  }

  // Cart decisions
  trackCartAccepted(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'CART_ACCEPTED', user_id: this.requireUserId(payload) });
  }
  trackCartRejected(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'CART_REJECTED', user_id: this.requireUserId(payload) });
  }

  // Coupons
  trackCouponViewed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'COUPON_VIEWED', object_type: 'coupon', user_id: this.requireUserId(payload) });
  }
  trackCouponClipped(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'COUPON_CLIPPED', object_type: 'coupon', user_id: this.requireUserId(payload) });
  }
  trackCouponRedeemed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'COUPON_REDEEMED', object_type: 'coupon', user_id: this.requireUserId(payload) });
  }

  // Stacks
  trackStackViewed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'STACK_VIEWED', object_type: 'stack', user_id: this.requireUserId(payload) });
  }
  trackStackApplied(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'STACK_APPLIED', object_type: 'stack', user_id: this.requireUserId(payload) });
  }
  trackStackDismissed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'STACK_DISMISSED', object_type: 'stack', user_id: this.requireUserId(payload) });
  }

  // Recommendations
  /** Synonym for RECOMMENDATION_EXPOSED — preferred in UI code */
  trackRecommendationShown(payload: Partial<InboundEvent> & {
    object_id: string;
    recommendation_type?: string;
  }): void {
    this.emit({
      ...payload,
      event_name: 'RECOMMENDATION_SHOWN',
      object_type: payload.object_type ?? 'recommendation',
      user_id: this.requireUserId(payload),
    });
  }
  trackRecommendationClicked(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'RECOMMENDATION_CLICKED', object_type: 'recommendation', user_id: this.requireUserId(payload) });
  }
  trackRecommendationDismissed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'RECOMMENDATION_DISMISSED', object_type: 'recommendation', user_id: this.requireUserId(payload) });
  }

  // Search
  trackSearchPerformed(payload: Partial<InboundEvent> & { metadata: { query: string } }): void {
    this.emit({ ...payload, event_name: 'SEARCH_PERFORMED', user_id: this.requireUserId(payload) });
  }

  // Preferences / profile
  trackPreferenceChanged(payload: Partial<InboundEvent>): void {
    this.emit({ ...payload, event_name: 'PREFERENCE_CHANGED', user_id: this.requireUserId(payload) });
  }
  trackBudgetSet(payload: Partial<InboundEvent> & { metadata: { budget_cents: number } }): void {
    this.emit({ ...payload, event_name: 'BUDGET_SET', user_id: this.requireUserId(payload) });
  }

  // Stores
  trackStoreSelected(payload: Partial<InboundEvent> & { retailer_key: string }): void {
    this.emit({ ...payload, event_name: 'STORE_SELECTED', user_id: this.requireUserId(payload) });
  }
  trackStoreDeselected(payload: Partial<InboundEvent> & { retailer_key: string }): void {
    this.emit({ ...payload, event_name: 'STORE_DESELECTED', user_id: this.requireUserId(payload) });
  }

  // Wealth / alerts
  trackWealthSnapshotViewed(meta?: Partial<InboundEvent>): void {
    this.emit({ ...meta, event_name: 'WEALTH_SNAPSHOT_VIEWED', user_id: this.requireUserId(meta) });
  }
  trackSmartAlertShown(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'SMART_ALERT_SHOWN', object_type: 'alert', user_id: this.requireUserId(payload) });
  }
  trackSmartAlertDismissed(payload: Partial<InboundEvent> & { object_id: string }): void {
    this.emit({ ...payload, event_name: 'SMART_ALERT_DISMISSED', object_type: 'alert', user_id: this.requireUserId(payload) });
  }

  /** Flush all queued events immediately */
  async flushNow(): Promise<void> {
    return this.flush();
  }

  // ── Private helpers ───────────────────────────────────────

  private requireUserId(payload?: Partial<InboundEvent> | null): string {
    const id = payload?.user_id ?? this.defaultUserId;
    if (!id) throw new Error('[SnippdTracker] user_id is required — set via setDefaultUserId() or pass in payload');
    return id;
  }

  private prepare(event: InboundEvent): InboundEvent {
    return {
      ...event,
      user_id:    event.user_id    ?? this.defaultUserId    ?? '',
      session_id: event.session_id ?? this.defaultSessionId ?? String(Date.now()),
      timestamp:  event.timestamp  ?? new Date().toISOString(),
    };
  }

  private enqueue(event: InboundEvent): void {
    this.queue.push({ event, retries: 0 });
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => void this.flush(), this.flushIntervalMs);
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0 || !this.token) {
      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      return;
    }

    this.isFlushing = true;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await this.sendBatch(batch.map((i) => i.event));
    } catch (err) {
      console.warn('[SnippdTracker] batch failed, scheduling retry', err);
      const retryable = batch
        .map((i) => ({ ...i, retries: i.retries + 1 }))
        .filter((i) => i.retries <= this.maxRetries);
      this.queue.unshift(...retryable);
      if (retryable.length > 0) {
        const delay = this.baseRetryDelayMs * 2 ** (retryable[0].retries - 1);
        setTimeout(() => void this.flush(), delay);
      }
    } finally {
      this.isFlushing = false;
      if (this.queue.length > 0) this.scheduleFlush();
    }
  }

  private async sendBatch(events: InboundEvent[]): Promise<void> {
    const endpoint = getEndpoint();
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${this.token!}`,
      },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[SnippdTracker] HTTP ${res.status}: ${text}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

export const tracker = new SnippdEventTracker();
export { SnippdEventTracker };
export type { EventName, InboundEvent };
