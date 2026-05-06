-- Migration 023: Canonical weekly lifecycle plan storage
-- Stores the validator-approved weekly manual separately from the encrypted
-- profile cache so receipts, learning hooks, and UI can reference the same
-- plan_id.

CREATE TABLE IF NOT EXISTS public.weekly_lifecycle_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status IN (
      'APPROVED',
      'LOW_YIELD_WEEK',
      'NEEDS_SUBSTITUTION',
      'DATA_STALE',
      'NO_RETAILER_COVERAGE'
    )
  ),
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

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_user_cycle_idx
  ON public.weekly_lifecycle_plans (user_id, circular_valid_from DESC);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_status_expiry_idx
  ON public.weekly_lifecycle_plans (status, stack_expires_at);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_payload_gin_idx
  ON public.weekly_lifecycle_plans USING gin (lifecycle_payload);

ALTER TABLE public.weekly_lifecycle_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own weekly lifecycle plans"
  ON public.weekly_lifecycle_plans
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage weekly lifecycle plans"
  ON public.weekly_lifecycle_plans
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_weekly_lifecycle_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_lifecycle_plans_touch_updated_at
  ON public.weekly_lifecycle_plans;

CREATE TRIGGER weekly_lifecycle_plans_touch_updated_at
  BEFORE UPDATE ON public.weekly_lifecycle_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_weekly_lifecycle_plans_updated_at();
