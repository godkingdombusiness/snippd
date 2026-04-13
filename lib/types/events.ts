export type EventType =
  | 'APP_OPENED'
  | 'ITEM_ADDED_TO_CART'
  | 'ITEM_REMOVED_FROM_CART'
  | 'CHECKOUT_STARTED'
  | 'CHECKOUT_COMPLETED'
  | 'PURCHASE_COMPLETED'
  | 'RECEIPT_UPLOADED'
  | 'SEARCH_PERFORMED'
  | 'PREFERENCE_CHANGED'
  | string;

export type EventCategory =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'pantry'
  | 'snacks'
  | 'beverages'
  | 'household'
  | 'other'
  | string;

export interface BaseEventPayload {
  event_name: EventType;
  user_id?: string;
  household_id?: string;
  session_id?: string;
  screen_name?: string;
  object_type?: string;
  object_id?: string;
  retailer_key?: string;
  category?: EventCategory;
  brand?: string;
  rank_position?: number;
  model_version?: string;
  explanation_shown?: boolean;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  app_version?: string;
  source?: string;
}

export interface ItemAddedToCartEvent extends BaseEventPayload {
  event_name: 'ITEM_ADDED_TO_CART';
  item_id?: string;
  product_name: string;
  quantity: number;
  price_cents: number;
  retailer?: string;
}

export interface ItemRemovedFromCartEvent extends BaseEventPayload {
  event_name: 'ITEM_REMOVED_FROM_CART';
  item_id?: string;
  product_name?: string;
  quantity?: number;
  price_cents?: number;
  retailer?: string;
}

export interface CheckoutStartedEvent extends BaseEventPayload {
  event_name: 'CHECKOUT_STARTED';
  cart_value_cents?: number;
  item_count?: number;
  retailer_key?: string;
}

export interface CheckoutCompletedEvent extends BaseEventPayload {
  event_name: 'CHECKOUT_COMPLETED' | 'PURCHASE_COMPLETED';
  cart_value_cents?: number;
  item_count?: number;
  retailer_key?: string;
  transaction_id?: string;
}

export interface SearchPerformedEvent extends BaseEventPayload {
  event_name: 'SEARCH_PERFORMED';
  search_query: string;
  search_category?: string;
}

export interface ReceiptUploadedEvent extends BaseEventPayload {
  event_name: 'RECEIPT_UPLOADED';
  store_name?: string;
  total_amount_cents?: number;
  item_count?: number;
}

export interface PreferenceChangedEvent extends BaseEventPayload {
  event_name: 'PREFERENCE_CHANGED';
  preference_key?: string;
  changed_fields?: Record<string, unknown>;
}

export interface AppOpenedEvent extends BaseEventPayload {
  event_name: 'APP_OPENED';
  app_version?: string;
  source?: string;
}

export interface RecommendationExposedEvent extends BaseEventPayload {
  event_name: 'RECOMMENDATION_EXPOSED';
  recommendation_type: string;
  object_type: string;
  object_id: string;
  rank_position?: number;
  score?: number;
  model_version?: string;
  explanation?: string;
  reason_codes?: string[];
}

export interface RecommendationOutcomeEvent extends BaseEventPayload {
  event_name: 'RECOMMENDATION_OUTCOME';
  object_id: string;
  outcome_status: 'clicked' | 'accepted' | 'dismissed' | 'ignored' | string;
  outcome_at?: string;
}

export type AppEventPayload =
  | ItemAddedToCartEvent
  | ItemRemovedFromCartEvent
  | CheckoutStartedEvent
  | CheckoutCompletedEvent
  | SearchPerformedEvent
  | ReceiptUploadedEvent
  | PreferenceChangedEvent
  | AppOpenedEvent
  | RecommendationExposedEvent
  | RecommendationOutcomeEvent
  | BaseEventPayload;
