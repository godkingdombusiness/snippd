-- ============================================================
-- Snippd — Slack Integration + Retailer Policy Change Tracking
-- 20260422_slack_integration.sql
-- Idempotent: safe to re-run
--
-- What this does:
--   1. Creates snippd_integrations — key/value store for external
--      service config (Slack webhooks, etc.)
--   2. Creates retailer_policy_change_log — append-only audit log
--      for retailer_coupon_parameters + retailer_rules changes
--   3. Attaches triggers to those two retailer tables
--   4. Adds hooks.slack.com to approved_domains (if table exists)
--   5. Schedules pg_cron job 'snippd-slack-policy-notify' every 5 min
--      to call the slack-notify Edge Function
--
-- Secrets required (set once in vault if not already present):
--   snippd_functions_url — Edge Functions base URL (already set by 003_pg_cron_jobs)
--   snippd_cron_secret   — x-cron-secret header value  (already set by 003_pg_cron_jobs)
-- ============================================================

-- ── Extensions (idempotent) ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. snippd_integrations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS snippd_integrations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  value       text,
  description text,
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: only service_role can read/write (keys may contain webhook URLs)
ALTER TABLE snippd_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'snippd_integrations' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON snippd_integrations
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at on write
CREATE OR REPLACE FUNCTION _update_snippd_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_snippd_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_snippd_integrations_updated_at
    BEFORE UPDATE ON snippd_integrations
    FOR EACH ROW EXECUTE FUNCTION _update_snippd_integrations_updated_at();
  END IF;
END $$;

-- Seed rows (value NULL / enabled false until configured via setup script)
INSERT INTO snippd_integrations (key, value, description, enabled) VALUES
  (
    'slack_policy_changes',
    NULL,
    'Slack incoming webhook URL for retailer policy change notifications. Run scripts/setup-slack-webhook.sh to configure.',
    false
  ),
  (
    'slack_channel_engineering',
    '#engineering',
    'Slack channel name for engineering policy-change notifications.',
    true
  )
ON CONFLICT (key) DO NOTHING;

-- ── 2. retailer_policy_change_log ────────────────────────────
CREATE TABLE IF NOT EXISTS retailer_policy_change_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text        NOT NULL,
  operation   text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  retailer_id text,
  old_data    jsonb,
  new_data    jsonb,
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Partial index speeds up the "find unnotified" query
CREATE INDEX IF NOT EXISTS idx_retailer_policy_change_log_pending
  ON retailer_policy_change_log (created_at ASC)
  WHERE notified_at IS NULL;

-- ── 3. Trigger function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION _log_retailer_policy_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_data    jsonb;
  v_old_data    jsonb;
  v_retailer_id text;
BEGIN
  v_new_data := CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  v_old_data := CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  v_retailer_id := COALESCE(
    v_new_data->>'retailer_id',
    v_old_data->>'retailer_id',
    v_new_data->>'id',
    v_old_data->>'id'
  );

  INSERT INTO retailer_policy_change_log (table_name, operation, retailer_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, TG_OP, v_retailer_id, v_old_data, v_new_data);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to retailer_coupon_parameters (guard: only if table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retailer_coupon_parameters'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_retailer_coupon_parameters_change'
  ) THEN
    CREATE TRIGGER trg_retailer_coupon_parameters_change
    AFTER INSERT OR UPDATE OR DELETE ON retailer_coupon_parameters
    FOR EACH ROW EXECUTE FUNCTION _log_retailer_policy_change();
  END IF;
END $$;

-- Attach to retailer_rules (guard: only if table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retailer_rules'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_retailer_rules_change'
  ) THEN
    CREATE TRIGGER trg_retailer_rules_change
    AFTER INSERT OR UPDATE OR DELETE ON retailer_rules
    FOR EACH ROW EXECUTE FUNCTION _log_retailer_policy_change();
  END IF;
END $$;

-- ── 4. Approved domains — add hooks.slack.com ─────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'approved_domains'
  ) THEN
    INSERT INTO public.approved_domains (id, domain, purpose)
    VALUES (gen_random_uuid(), 'hooks.slack.com', 'webhook')
    ON CONFLICT (domain) DO NOTHING;
  END IF;
END $$;

-- ── 5. pg_cron — Slack policy-change notifier (every 5 min) ──
DO $$ BEGIN PERFORM cron.unschedule('snippd-slack-policy-notify'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'snippd-slack-policy-notify',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/slack-notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron","trigger":"policy_change_check"}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM retailer_policy_change_log WHERE notified_at IS NULL LIMIT 1
  )
  $$
);
