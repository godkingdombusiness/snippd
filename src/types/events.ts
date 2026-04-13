// ============================================================
// Snippd — Event System Types
// Convention: snake_case (DB/API-facing)
// ============================================================

// ============================================================
// EVENT NAMES
// ============================================================

export type EventName =
  // App lifecycle
  | 'APP_OPENED'
  | 'APP_CLOSED'
  | 'APP_FOREGROUNDED'
  | 'ONBOARDING_STARTED'
  | 'ONBOARDING_COMPLETED'
  // Item interactions
  | 'ITEM_VIEWED'
  | 'ITEM_ADDED_TO_CART'
  | 'ITEM_REMOVED_FROM_CART'
  | 'ITEM_SUBSTITUTED'
  // Checkout & purchase
  | 'CHECKOUT_STARTED'
  | 'CHECKOUT_COMPLETED'
  | 'PURCHASE_COMPLETED'
  | 'RECEIPT_UPLOADED'
  | 'RECEIPT_PARSED'
  // Cart decisions
  | 'CART_ACCEPTED'
  | 'CART_REJECTED'
  // Search
  | 'SEARCH_PERFORMED'
  | 'SEARCH_FILTER_APPLIED'
  // Preferences & profile
  | 'PREFERENCE_CHANGED'
  | 'PROFILE_UPDATED'
  | 'BUDGET_SET'
  | 'BUDGET_EXCEEDED'
  // Coupons
  | 'COUPON_VIEWED'
  | 'COUPON_CLIPPED'
  | 'COUPON_REDEEMED'
  | 'COUPON_EXPIRED'
  // Stacks
  | 'STACK_VIEWED'
  | 'STACK_APPLIED'
  | 'STACK_DISMISSED'
  | 'STACK_COMPUTED'
  // Recommendations
  | 'RECOMMENDATION_SHOWN'
  | 'RECOMMENDATION_EXPOSED'
  | 'RECOMMENDATION_CLICKED'
  | 'RECOMMENDATION_DISMISSED'
  | 'RECOMMENDATION_OUTCOME'
  // Stores
  | 'STORE_SELECTED'
  | 'STORE_DESELECTED'
  // Wealth / alerts
  | 'WEALTH_SNAPSHOT_VIEWED'
  | 'SMART_ALERT_SHOWN'
  | 'SMART_ALERT_DISMISSED';

// ============================================================
// EVENT PAYLOADS
// ============================================================

/** Raw event sent from the client to ingest-event */
export interface InboundEvent {
  event_name: EventName | string;
  user_id: string;
  /** Filled in by SnippdEventTracker.prepare() if not explicitly set */
  session_id: string;
  household_id?: string;
  screen_name?: string;
  object_type?: string;
  object_id?: string;
  retailer_key?: string;
  category?: string;
  brand?: string;
  rank_position?: number;
  model_version?: string;
  explanation_shown?: boolean;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/** Stored event row (after ingest) */
export interface StoredEvent extends InboundEvent {
  id: string;
  timestamp: string;
}

// ============================================================
// RECOMMENDATION EXPOSURES
// ============================================================

export interface RecommendationExposure {
  id: string;
  user_id: string;
  session_id: string;
  recommendation_type: string;
  object_type: string;
  object_id: string;
  rank_position?: number;
  score?: number;
  model_version?: string;
  explanation?: string;
  reason_codes?: string[];
  shown_at: string;
  clicked_at?: string;
  accepted_at?: string;
  dismissed_at?: string;
  outcome_status: 'shown' | 'clicked' | 'accepted' | 'dismissed' | 'ignored';
}

// ============================================================
// PREFERENCE SCORES
// ============================================================

export interface PreferenceScore {
  user_id: string;
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  score: number;
  normalized_score: number;
  last_updated: string;
}

// ============================================================
// USER STATE SNAPSHOTS
// ============================================================

export type ShoppingMode =
  | 'deal_hunter'
  | 'convenience'
  | 'budget_conscious'
  | 'loyal_brand'
  | 'variety_seeker'
  | 'unknown';

export interface UserStateSnapshot {
  user_id: string;
  snapshot: {
    updated_at: string;
    preferences: PreferenceScore[];
    budget_stress_level: number;         // 0–1
    shopping_mode: ShoppingMode;
    coupon_responsiveness: number;       // 0–1
    bogo_responsiveness: number;         // 0–1
    multi_store_responsiveness: number;  // 0–1
    substitution_responsiveness: number; // 0–1
  };
  snapshot_at: string;
}

// ============================================================
// VERTEX FEATURE VECTOR
// ============================================================

export interface VertexFeatureVector {
  user_id: string;
  budget_stress_level: number;
  shopping_mode: ShoppingMode;
  coupon_responsiveness: number;
  bogo_responsiveness: number;
  multi_store_responsiveness: number;
  substitution_responsiveness: number;
  avg_weekly_spend_cents: number;
  avg_weekly_savings_cents: number;
  preferred_categories: string[];
  preferred_brands: string[];
  preferred_retailers: string[];
  snapshot_at: string;
}

// ============================================================
// WEALTH MOMENTUM INPUT
// ============================================================

export interface WealthMomentumInput {
  user_id: string;
  total_spent_cents: number;
  total_saved_cents: number;
  trip_items?: Array<{
    category?: string;
    on_stack?: boolean;
    price_cents?: number;
    quantity?: number;
  }>;
  budget_cents?: number;
}

// ============================================================
// RECEIPT PROCESSING
// ============================================================

export interface ParsedReceiptItem {
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  promo_savings_cents?: number;
  normalized_key: string;
  category?: string;
  brand?: string;
}

export interface ParsedReceipt {
  store_name: string;
  date: string;
  items: ParsedReceiptItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

export interface WealthMomentumResult {
  user_id: string;
  timestamp: string;
  realized_savings: number;
  inflation_offset: number;
  velocity_score: number;
  wealth_momentum: number;
  projected_annual_wealth: number;
  budget_stress_alert: boolean;
  budget_stress_score: number;
  transparency_report: {
    math_version: string;
    data_sources: string[];
    formula: string;
    breakdown: Array<{
      component: string;
      value: number;
      explanation: string;
    }>;
  };
}

// ============================================================
// STACKING — API-facing shapes (snake_case)
// See src/types/stacking.ts for the computation-facing types
// ============================================================

export interface StackOfferApi {
  id: string;
  offer_type: string;
  description?: string;
  discount_cents?: number;
  discount_pct?: number;
  final_price_cents?: number;
  bogo_model?: string;
  buy_qty?: number;
  get_qty?: number;
  required_qty?: number;
  max_redemptions?: number;
  stackable: boolean;
  exclusion_group?: string;
  priority?: number;
  expires_at?: string;
  coupon_type?: string;
  rebate_cents?: number;
}

export interface StackItemApi {
  id: string;
  name?: string;
  regular_price_cents: number;
  quantity: number;
  category?: string;
  brand?: string;
  offers: StackOfferApi[];
}

export interface StackResultApi {
  basket_id: string;
  retailer_key: string;
  basket_regular_cents: number;
  basket_final_cents: number;
  total_savings_cents: number;
  in_stack_savings_cents: number;
  rebate_cents: number;
  warnings: string[];
  rejected_offer_ids: string[];
  explanation_summary: string;
  computed_at: string;
  model_version: string;
}

export interface RetailerPolicyApi {
  retailer_key: string;
  max_stack_items: number;
  allowed_coupon_types: string[];
  max_total_coupon_value_cents: number;
  block_sale_and_digital: boolean;
  block_bogo_and_coupon: boolean;
  block_sale_and_loyalty: boolean;
}
