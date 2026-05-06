/**
 * run-all-migrations — Targeted migration runner for remaining critical tables
 *
 * Downloads only the remaining missing tables SQL and executes via internal DB.
 * Auth: x-ingest-key required.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Critical SQL — only tables that are still missing in production
// All IF NOT EXISTS guards make this safe to re-run
const CRITICAL_SQL = `
-- weekly_lifecycle_plans (needed by get-weekly-plan, checkout-math, OmniStoreComparison)
CREATE TABLE IF NOT EXISTS public.weekly_lifecycle_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('APPROVED','LOW_YIELD_WEEK','NEEDS_SUBSTITUTION','DATA_STALE','NO_RETAILER_COVERAGE')),
  retailer_node text NOT NULL,
  cycle_dates text NOT NULL,
  circular_valid_from date NOT NULL,
  circular_valid_until date NOT NULL,
  next_circular_at timestamptz NOT NULL,
  stack_expires_at timestamptz NOT NULL,
  target_cap_cents integer NOT NULL CHECK (target_cap_cents >= 0),
  actual_oop_cents integer NOT NULL CHECK (actual_oop_cents >= 0),
  savings_percentage numeric(5,2) NOT NULL CHECK (savings_percentage >= 0),
  surplus_available_cents integer NOT NULL,
  lifecycle_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_verification_id text,
  validation_errors text[] NOT NULL DEFAULT ARRAY[]::text[],
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_user_cycle_idx ON public.weekly_lifecycle_plans (user_id, circular_valid_from DESC);
CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_status_expiry_idx ON public.weekly_lifecycle_plans (status, stack_expires_at);
ALTER TABLE public.weekly_lifecycle_plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='weekly_lifecycle_plans' AND policyname='Users can read own weekly lifecycle plans') THEN
    CREATE POLICY "Users can read own weekly lifecycle plans" ON public.weekly_lifecycle_plans FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='weekly_lifecycle_plans' AND policyname='Service role can manage weekly lifecycle plans') THEN
    CREATE POLICY "Service role can manage weekly lifecycle plans" ON public.weekly_lifecycle_plans FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- checkout_math_snapshots (needed by HomeScreen savings, WinsScreen)
CREATE TABLE IF NOT EXISTS public.checkout_math_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text NOT NULL DEFAULT '',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_math_snapshots_plan_idx ON public.checkout_math_snapshots (plan_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS checkout_math_snapshots_user_idx ON public.checkout_math_snapshots (user_id, computed_at DESC);
ALTER TABLE public.checkout_math_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checkout_math_snapshots' AND policyname='Users can read own checkout math snapshots') THEN
    CREATE POLICY "Users can read own checkout math snapshots" ON public.checkout_math_snapshots FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checkout_math_snapshots' AND policyname='Service role can manage checkout math snapshots') THEN
    CREATE POLICY "Service role can manage checkout math snapshots" ON public.checkout_math_snapshots FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- authoritative_funding_ledger
CREATE TABLE IF NOT EXISTS public.authoritative_funding_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_status text NOT NULL CHECK (authorization_status IN ('AUTHORIZED','REJECTED','EXPIRED','REVOKED')),
  authorized_amount_cents integer NOT NULL CHECK (authorized_amount_cents >= 0),
  savings_pct numeric(5,2) NOT NULL CHECK (savings_pct >= 0),
  retailer_nodes text[] NOT NULL DEFAULT ARRAY[]::text[],
  signature text NOT NULL DEFAULT '',
  math_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_user_idx ON public.authoritative_funding_ledger (user_id, authorized_at DESC);
ALTER TABLE public.authoritative_funding_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='authoritative_funding_ledger' AND policyname='Users can read own funding authorizations') THEN
    CREATE POLICY "Users can read own funding authorizations" ON public.authoritative_funding_ledger FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='authoritative_funding_ledger' AND policyname='Service role can manage funding authorizations') THEN
    CREATE POLICY "Service role can manage funding authorizations" ON public.authoritative_funding_ledger FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- user_trips (WeeklyPlanScreen "Lock In" destination)
CREATE TABLE IF NOT EXISTS user_trips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_week_start date NOT NULL,
  total_estimated_cents integer NOT NULL DEFAULT 0,
  total_savings_cents integer NOT NULL DEFAULT 0,
  store_preference text NOT NULL DEFAULT 'one_stop',
  primary_store text,
  item_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  clipped_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_trips_preference_valid CHECK (store_preference IN ('one_stop','multi_store')),
  CONSTRAINT user_trips_status_valid CHECK (status IN ('planned','shopping','verified'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_trips_user_week_idx ON user_trips (user_id, plan_week_start);
ALTER TABLE user_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_trips_select" ON user_trips;
CREATE POLICY "user_trips_select" ON user_trips FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_trips_insert" ON user_trips;
CREATE POLICY "user_trips_insert" ON user_trips FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_trips_update" ON user_trips;
CREATE POLICY "user_trips_update" ON user_trips FOR UPDATE USING (auth.uid() = user_id);

-- household_cart_items (BudgetDashboard, CartScreen)
CREATE TABLE IF NOT EXISTS public.household_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  save_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','purchased','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_cart_items_household_idx ON public.household_cart_items (household_id, status);
ALTER TABLE public.household_cart_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='household_cart_items' AND policyname='household_cart_items_select') THEN
    CREATE POLICY "household_cart_items_select" ON public.household_cart_items FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- geo_auth_logs (healthMonitor, geo-auth-check Edge Function)
CREATE TABLE IF NOT EXISTS public.geo_auth_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address text,
  city text,
  country text,
  otp_required boolean NOT NULL DEFAULT false,
  distance_miles integer,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_auth_logs_user_idx ON public.geo_auth_logs (user_id, created_at DESC);

-- honey_token_skus (security audit)
CREATE TABLE IF NOT EXISTS public.honey_token_skus (
  id text PRIMARY KEY,
  description text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.honey_token_skus (id, description)
VALUES ('honey_sku_001','Decoy SKU'),('honey_sku_002','Decoy SKU'),('honey_sku_003','Decoy SKU')
ON CONFLICT DO NOTHING;

-- healing_events (healthMonitor logging)
CREATE TABLE IF NOT EXISTS public.healing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  event_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS healing_events_user_idx ON public.healing_events (user_id, created_at DESC);
ALTER TABLE public.healing_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='healing_events' AND policyname='healing_events_select') THEN
    CREATE POLICY "healing_events_select" ON public.healing_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- agent_initialization (concierge onboarding flow)
CREATE TABLE IF NOT EXISTS public.agent_initialization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete','failed')),
  concierge_payload jsonb DEFAULT '{}'::jsonb,
  initialized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_initialization ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_initialization' AND policyname='agent_init_select') THEN
    CREATE POLICY "agent_init_select" ON public.agent_initialization FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

SELECT 'CRITICAL TABLES CREATED OK' AS status;
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ingestKey = Deno.env.get('INGEST_API_KEY') ?? '';
  const xKey = req.headers.get('x-ingest-key') ?? '';
  if (xKey !== ingestKey || ingestKey === '') return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Use only internal DB URL — external pooler is IP-blocked from Edge Functions
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') || '';

  if (!dbUrl) return json({ error: 'No DB URL configured. Set PG_URL secret.' }, 500);

  const sb = createClient(supabaseUrl, serviceKey);

  // Connect and execute the targeted SQL
  const pool = new Pool(dbUrl, 1, true);
  let client;
  let execResult: string | null = null;
  let execError: string | null = null;

  try {
    client = await pool.connect();
    const result = await client.queryObject(CRITICAL_SQL);
    execResult = 'executed_ok';
  } catch (err: unknown) {
    execError = err instanceof Error ? err.message : String(err);
  } finally {
    client?.release();
    await pool.end();
  }

  // Verify which tables now exist
  const tables = [
    'weekly_lifecycle_plans', 'checkout_math_snapshots', 'authoritative_funding_ledger',
    'user_trips', 'household_cart_items', 'geo_auth_logs', 'honey_token_skus',
    'healing_events', 'agent_initialization',
  ];

  const verification: Record<string, boolean> = {};
  for (const t of tables) {
    const { error } = await sb.from(t).select('id').limit(0);
    verification[t] = !error;
  }

  const allOk = Object.values(verification).every(Boolean);

  return json({
    status: allOk ? 'ALL_OK' : 'PARTIAL',
    db_execution: execResult || execError,
    table_verification: verification,
  });
});
