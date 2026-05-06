-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260427_persona_expansion
-- Shopping Bestie persona expansion — household DNA, clinical guardrails,
-- pantry anchors, behavioral signals, and forecast/briefing tracking.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand user_persona ────────────────────────────────────────────────────

ALTER TABLE user_persona
  -- Household composition: { "infant":1, "teenager":2, "adult":2, "pet":1 }
  ADD COLUMN IF NOT EXISTS household_composition            JSONB    DEFAULT '{}',

  -- Spending leak category (from Forecast step 2)
  ADD COLUMN IF NOT EXISTS leak_category                   TEXT,
  -- Values: 'convenience_tax' | 'brand_trap' | 'target_drift' | 'healthy_premium'

  -- Bio/health mission (from Forecast step 3)
  ADD COLUMN IF NOT EXISTS mission_type                    TEXT,
  -- Values: 'clinical_guardrails' | 'program_tracking' | 'athletic_fuel' | 'pure_savings'

  -- Raw monthly spend input (cents, from Forecast step 4)
  ADD COLUMN IF NOT EXISTS monthly_spend_cents             INTEGER,

  -- Calculated projected monthly recovery (cents)
  ADD COLUMN IF NOT EXISTS projected_monthly_recovery_cents INTEGER,

  -- "Why do you need Snippd?" — free text for social proof
  ADD COLUMN IF NOT EXISTS why_snippd                      TEXT,

  -- ── Deep Brief (Chapter 2 — Safety Net) ──────────────────────────────────
  ADD COLUMN IF NOT EXISTS clinical_allergies              TEXT[]   DEFAULT '{}',
  -- Values: 'peanut' | 'tree_nut' | 'gluten' | 'dairy' | 'shellfish' | 'soy' | 'egg'

  ADD COLUMN IF NOT EXISTS clinical_diagnoses              TEXT[]   DEFAULT '{}',
  -- Values: 'diabetes_t2' | 'hypertension' | 'celiac' | 'ibs' | 'lactose_intolerant'

  -- Exact ages for children (for growth-spurt spend modeling)
  ADD COLUMN IF NOT EXISTS child_ages                      INTEGER[] DEFAULT '{}',

  -- ── Deep Brief (Chapter 3 — Pantry DNA) ──────────────────────────────────
  -- Anchor products: the non-negotiables they always buy
  ADD COLUMN IF NOT EXISTS pantry_anchors                  TEXT[]   DEFAULT '{}',
  -- e.g. ['Folgers Coffee', 'Organic Valley Milk', 'Kind Bars']

  -- ── Deep Brief (Chapter 4 — Money & Stores) ──────────────────────────────
  ADD COLUMN IF NOT EXISTS preferred_stores                TEXT[]   DEFAULT '{}',
  -- e.g. ['costco', 'kroger', 'target', 'walmart', 'aldi', 'whole_foods']

  ADD COLUMN IF NOT EXISTS loyalty_cards                   TEXT[]   DEFAULT '{}',
  -- e.g. ['kroger', 'target', 'costco']

  ADD COLUMN IF NOT EXISTS financial_goal                  TEXT,
  -- Values: 'debt_payoff' | 'build_wealth' | 'emergency_fund' | 'stretch_budget'

  -- ── Deep Brief (Chapter 5 — Style) ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS stress_behavior                 TEXT,
  -- How they shop when stressed: 'orders_delivery' | 'grabs_fast_food' | 'still_cooks' | 'eats_whatever'

  ADD COLUMN IF NOT EXISTS autonomy_level                  TEXT     DEFAULT 'confirm',
  -- Values: 'show_deals' | 'build_cart' | 'full_auto'

  ADD COLUMN IF NOT EXISTS cooking_frequency               TEXT,
  -- Values: 'daily' | 'few_times_week' | 'weekends_only' | 'rarely'

  ADD COLUMN IF NOT EXISTS brand_affinity                  TEXT,
  -- Values: 'generic_always' | 'mix' | 'name_brand_loyal' | 'organic_premium'

  ADD COLUMN IF NOT EXISTS shopping_style                  TEXT,
  -- Values: 'planned_list' | 'sale_hunter' | 'as_needed' | 'weekly_batch'

  -- Free text from onboarding (e.g. "My kids won't eat anything green")
  ADD COLUMN IF NOT EXISTS persona_notes                   TEXT,

  -- ── Living signals — updated from receipt analysis ──────────────────────
  ADD COLUMN IF NOT EXISTS behavior_signals                JSONB    DEFAULT '{}',
  -- e.g. { "fast_food_freq_7d": 3, "health_trend": "improving", "buying_generics": true }

  -- Persona version — increments on each evolution (receipt-driven update)
  ADD COLUMN IF NOT EXISTS persona_version                 INTEGER  DEFAULT 1,

  -- Tracking flags
  ADD COLUMN IF NOT EXISTS forecast_completed              BOOLEAN  DEFAULT FALSE,
  -- TRUE after the 4-step Waitlist Forecast is submitted

  ADD COLUMN IF NOT EXISTS briefing_completed              BOOLEAN  DEFAULT FALSE;
  -- TRUE after the 5-chapter Deep Briefing (activation onboarding)

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

-- Fast lookup for users who haven't completed forecast yet
CREATE INDEX IF NOT EXISTS idx_persona_forecast_pending
  ON user_persona(user_id)
  WHERE forecast_completed = FALSE;

-- GIN index for household composition queries
-- (e.g. "find all users with infants for formula nurture emails")
CREATE INDEX IF NOT EXISTS idx_persona_household
  ON user_persona USING gin(household_composition);

-- GIN index for behavioral signal queries
CREATE INDEX IF NOT EXISTS idx_persona_behavior_signals
  ON user_persona USING gin(behavior_signals);

-- GIN index for clinical data (allergy-aware product filtering)
CREATE INDEX IF NOT EXISTS idx_persona_allergies
  ON user_persona USING gin(clinical_allergies);

-- ── 3. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN user_persona.household_composition IS
  'JSON count map of household members: {"infant":1,"teenager":2,"adult":2,"pet":1}';

COMMENT ON COLUMN user_persona.behavior_signals IS
  'Living signals updated from receipt analysis. Never overwrite — merge with jsonb_set.';

COMMENT ON COLUMN user_persona.persona_version IS
  'Increments each time the persona is updated from behavioral signals.';

COMMENT ON COLUMN user_persona.forecast_completed IS
  'TRUE after user completes the 4-step Waitlist Forecast. Gates WaitlistScreen.';

COMMENT ON COLUMN user_persona.briefing_completed IS
  'TRUE after user completes the 5-chapter Deep Briefing (post-activation).';

COMMENT ON COLUMN user_persona.pantry_anchors IS
  'Non-negotiable anchor products used for price-drop alerts and substitution scoring.';

COMMENT ON COLUMN user_persona.why_snippd IS
  'User free-text "Why do you need Snippd?" — used for social proof and viral share.';
