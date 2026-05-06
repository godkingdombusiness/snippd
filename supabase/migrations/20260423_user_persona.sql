-- ============================================================
-- Snippd — User Persona / Economic DNA
-- 20260423_user_persona.sql
-- Idempotent: safe to re-run
--
-- Stores the output of the 7-step Concierge onboarding flow.
-- One row per user. Written exclusively by the initialize-agent
-- Edge Function — never written directly from the client.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_persona (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Q1: Mission
  mission                    text        CHECK (mission IN ('rent_killer', 'save_goal', 'find_deals')),

  -- Q2: Monthly Budget
  monthly_budget_cents       int         CHECK (monthly_budget_cents > 0),

  -- Q3: Agent Power Level
  power_level                text        CHECK (power_level IN ('notify_only', 'ask_first', 'full_auto')),

  -- Q4: Spending Leak Category
  leak_category              text        CHECK (leak_category IN ('amazon', 'food_apps', 'clothing')),

  -- Q5: Style Vibe (visual select)
  style_vibe                 text        CHECK (style_vibe IN ('casual_minimal', 'trend_forward', 'investment')),

  -- Q6: Size DNA
  clothing_size              text,       -- S | M | L | XL | XXL
  shoe_size                  text,       -- e.g. "10", "10.5"

  -- Q7: Shopping Frequency
  shop_frequency             text        CHECK (shop_frequency IN ('daily', 'weekly', 'big_events')),

  -- Agent Initialization Output (set by initialize-agent)
  onboarding_completed_at    timestamptz,
  initial_savings_cents      int,        -- Mock projected monthly savings
  items_at_floor_price       int,        -- Mock count of items currently at price floor
  leak_savings_cents         int,        -- Mock savings identified in leak category
  economic_dna               jsonb,      -- Full snapshot of onboarding answers for ML/personalization

  -- Timestamps
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_persona_user_id ON user_persona (user_id);
CREATE INDEX IF NOT EXISTS idx_user_persona_mission  ON user_persona (mission) WHERE mission IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE user_persona ENABLE ROW LEVEL SECURITY;

-- Users can read their own persona (for Daily Pulse, personalization)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_persona' AND policyname = 'select_own'
  ) THEN
    CREATE POLICY select_own ON user_persona
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Only service_role can insert/update (all writes go through initialize-agent Edge Function)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_persona' AND policyname = 'service_role_write'
  ) THEN
    CREATE POLICY service_role_write ON user_persona
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION _update_user_persona_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_persona_updated_at') THEN
    CREATE TRIGGER trg_user_persona_updated_at
    BEFORE UPDATE ON user_persona
    FOR EACH ROW EXECUTE FUNCTION _update_user_persona_updated_at();
  END IF;
END $$;
