-- Migration 024: Authoritative checkout math snapshots
-- Cloud Run writes one row per server-side checkout calculation.

CREATE TABLE IF NOT EXISTS public.checkout_math_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_math_snapshots_plan_idx
  ON public.checkout_math_snapshots (plan_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS checkout_math_snapshots_user_idx
  ON public.checkout_math_snapshots (user_id, computed_at DESC);

ALTER TABLE public.checkout_math_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own checkout math snapshots"
  ON public.checkout_math_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage checkout math snapshots"
  ON public.checkout_math_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
