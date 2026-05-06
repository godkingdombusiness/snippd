-- Migration 025: Authoritative signed funding ledger
-- Records Cloud Run-approved math payloads that are allowed to fund a card or
-- lock a Snippd stack. The mobile app must never authorize funding from local
-- calculations.

CREATE TABLE IF NOT EXISTS public.authoritative_funding_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_status text NOT NULL CHECK (
    authorization_status IN ('AUTHORIZED', 'REJECTED', 'EXPIRED', 'REVOKED')
  ),
  authorized_amount_cents integer NOT NULL CHECK (authorized_amount_cents >= 0),
  savings_pct numeric(5,2) NOT NULL CHECK (savings_pct >= 0),
  retailer_nodes text[] NOT NULL DEFAULT ARRAY[]::text[],
  signature text NOT NULL,
  math_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_plan_idx
  ON public.authoritative_funding_ledger (plan_id, authorized_at DESC);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_user_idx
  ON public.authoritative_funding_ledger (user_id, authorized_at DESC);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_status_idx
  ON public.authoritative_funding_ledger (authorization_status, expires_at);

ALTER TABLE public.authoritative_funding_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own funding authorizations"
  ON public.authoritative_funding_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage funding authorizations"
  ON public.authoritative_funding_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
