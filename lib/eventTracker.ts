import {
  AppEventPayload,
  ItemAddedToCartEvent,
  ItemRemovedFromCartEvent,
  CheckoutStartedEvent,
  CheckoutCompletedEvent,
  SearchPerformedEvent,
  ReceiptUploadedEvent,
  PreferenceChangedEvent,
  AppOpenedEvent,
  RecommendationExposedEvent,
  RecommendationOutcomeEvent,
} from './types/events';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const INGEST_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ingest-event` : '';

function ensureEndpoint(): string {
  if (!INGEST_ENDPOINT) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be set to use eventTracker');
  }
  return INGEST_ENDPOINT;
}

function buildHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

interface QueueItem {
  event: AppEventPayload;
  retries: number;
}

class EventTracker {
  private token: string | null = null;
  private defaultSessionId: string | null = null;
  private queue: QueueItem[] = [];
  private flushTimer: number | null = null;
  private isFlushing = false;
  private readonly maxBatchSize = 10;
  private readonly flushIntervalMs = 2500;
  private readonly maxRetries = 3;

  setAccessToken(token: string) {
    this.token = token;
  }

  setDefaultSessionId(sessionId: string) {
    this.defaultSessionId = sessionId;
  }

  private enqueue(event: AppEventPayload) {
    this.queue.push({ event, retries: 0 });
    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
      return;
    }
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushIntervalMs) as unknown as number;
  }

  private async sendBatch(batch: AppEventPayload[]) {
    const endpoint = ensureEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(this.token!),
      body: JSON.stringify({ events: batch }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EventTracker batch request failed ${response.status}: ${errorText}`);
    }
  }

  private async flush() {
    if (this.isFlushing || this.queue.length === 0 || !this.token) {
      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer as unknown as ReturnType<typeof setTimeout>);
        this.flushTimer = null;
      }
      return;
    }

    this.isFlushing = true;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer as unknown as ReturnType<typeof setTimeout>);
      this.flushTimer = null;
    }

    const batch = this.queue.splice(0, this.maxBatchSize);
    try {
      await this.sendBatch(batch.map((entry) => entry.event));
    } catch (error) {
      console.warn('EventTracker batch failed', error);
      const retryItems = batch
        .map((entry) => ({ ...entry, retries: entry.retries + 1 }))
        .filter((entry) => entry.retries <= this.maxRetries);
      this.queue.unshift(...retryItems);
      if (retryItems.length > 0) {
        setTimeout(() => this.flush(), 1500);
      }
    } finally {
      this.isFlushing = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private prepareEvent(event: AppEventPayload): AppEventPayload {
    return {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
      session_id: event.session_id ?? this.defaultSessionId ?? String(Date.now()),
    };
  }

  async trackEvent(event: AppEventPayload) {
    if (!this.token) {
      console.warn('EventTracker: access token is not set');
      return;
    }
    this.enqueue(this.prepareEvent(event));
  }

  trackItemAddedToCart(payload: Omit<ItemAddedToCartEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'ITEM_ADDED_TO_CART' });
  }

  trackItemRemovedFromCart(payload: Omit<ItemRemovedFromCartEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'ITEM_REMOVED_FROM_CART' });
  }

  trackCheckoutStarted(payload: Omit<CheckoutStartedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'CHECKOUT_STARTED' });
  }

  trackCheckoutCompleted(payload: Omit<CheckoutCompletedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'CHECKOUT_COMPLETED' });
  }

  trackPurchaseCompleted(payload: Omit<CheckoutCompletedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'PURCHASE_COMPLETED' });
  }

  trackSearchPerformed(payload: Omit<SearchPerformedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'SEARCH_PERFORMED' });
  }

  trackReceiptUploaded(payload: Omit<ReceiptUploadedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'RECEIPT_UPLOADED' });
  }

  trackPreferenceChanged(payload: Omit<PreferenceChangedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'PREFERENCE_CHANGED' });
  }

  trackAppOpened(payload: Omit<AppOpenedEvent, 'event_name'> = {}) {
    return this.trackEvent({ ...payload, event_name: 'APP_OPENED' });
  }

  trackRecommendationExposed(payload: Omit<RecommendationExposedEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'RECOMMENDATION_EXPOSED' });
  }

  trackRecommendationOutcome(payload: Omit<RecommendationOutcomeEvent, 'event_name'>) {
    return this.trackEvent({ ...payload, event_name: 'RECOMMENDATION_OUTCOME' });
  }

  trackBatchEvents(events: AppEventPayload[]) {
    events.forEach((event) => this.enqueue(this.prepareEvent(event)));
  }
}

export const tracker = new EventTracker();
