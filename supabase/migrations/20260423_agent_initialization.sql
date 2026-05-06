-- ============================================================
-- Snippd — Web App Agent Initialization / Waitlist
-- 20260423_agent_initialization.sql
-- Written by: initialize-agent Next.js API route
-- Used by: Snippd web onboarding flow (Next.js app in web/)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_initialization (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text        NOT NULL UNIQUE,

  -- 7 Concierge answers
  mission            text        CHECK (mission IN ('rent_killer', 'save_goal', 'find_deals')),
  budget_cents       int,
  power_level        text        CHECK (power_level IN ('notify_only', 'ask_first', 'full_auto')),
  leak_category      text        CHECK (leak_category IN ('amazon', 'food_apps', 'clothing')),
  style_vibe         text        CHECK (style_vibe IN ('casual_minimal', 'trend_forward', 'investment')),
  clothing_size      text,
  shoe_size          text,
  shop_frequency     text        CHECK (shop_frequency IN ('daily', 'weekly', 'big_events')),

  -- Conversion
  status             text        NOT NULL DEFAULT 'waitlist' CHECK (status IN ('waitlist', 'beta', 'lifetime')),
  payment_id         text,                        -- Stripe subscription or payment intent ID
  stripe_customer_id text,

  -- CRM
  crm_tags           text[]      DEFAULT '{}',    -- e.g. ['Rent-Killer-Segment', 'Waitlist-Free']

  -- Full snapshot for ML / personalization
  economic_dna       jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_init_email   ON agent_initialization (email);
CREATE INDEX IF NOT EXISTS idx_agent_init_status  ON agent_initialization (status);
CREATE INDEX IF NOT EXISTS idx_agent_init_mission ON agent_initialization (mission) WHERE mission IS NOT NULL;

-- RLS: service_role writes; no direct client access
ALTER TABLE agent_initialization ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_initialization' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON agent_initialization
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _update_agent_initialization_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agent_init_updated_at') THEN
    CREATE TRIGGER trg_agent_init_updated_at
    BEFORE UPDATE ON agent_initialization
    FOR EACH ROW EXECUTE FUNCTION _update_agent_initialization_updated_at();
  END IF;
END $$;
