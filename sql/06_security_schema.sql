-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — Production Security Monitoring Schema
-- Version: 1.0.0
-- Covers: event logging, alerting, deduplication, blocking, investigation,
--         domain allowlisting, artifact tracking, config management
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for similarity searches on payloads

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE severity_level      AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE alert_status        AS ENUM ('PENDING','SENT','FAILED','SUPPRESSED','ESCALATED');
CREATE TYPE indicator_type      AS ENUM ('IP','TOKEN','DEVICE_FINGERPRINT','USER_ID','EMAIL','DOMAIN','USER_AGENT','SESSION_ID');
CREATE TYPE investigation_status AS ENUM ('OPEN','IN_PROGRESS','CONTAINED','RESOLVED','FALSE_POSITIVE');
CREATE TYPE artifact_risk       AS ENUM ('SUSPICIOUS','MALICIOUS','QUARANTINED','CLEARED');

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. security_events — central event log (immutable, append-only via RLS)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.security_events (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              timestamptz DEFAULT now() NOT NULL,

  -- Classification
  event_type              text        NOT NULL,   -- e.g. BRUTE_FORCE_LOGIN, SECRET_ACCESS_ATTEMPT
  category                text        NOT NULL,   -- AUTH | ACCESS_CONTROL | INJECTION | EXFILTRATION |
                                                  -- DEVELOPER_TOOL | REPO_TRUST | ABUSE | MONITORING | SYSTEM
  severity                severity_level NOT NULL DEFAULT 'LOW',
  risk_score              int         NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),

  -- Source
  source_system           text        NOT NULL,   -- app | api | edge_function | admin | ci_cd | developer_tool
  environment             text        NOT NULL DEFAULT 'production',

  -- Identity context (all nullable — events may fire before auth)
  user_id                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_user              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id              text,
  request_id              text,

  -- Network context
  ip_address              inet,
  geo                     jsonb,        -- {country, city, asn, is_vpn, is_tor, is_datacenter}
  user_agent              text,
  device_fingerprint      text,

  -- Request context
  route                   text,
  method                  text,
  status_code             int,
  resource_type           text,
  resource_id             text,

  -- Event detail
  summary                 text        NOT NULL,
  metadata                jsonb       NOT NULL DEFAULT '{}',

  -- Deduplication
  fingerprint             text        NOT NULL,   -- sha256(event_type||user_id||ip||route||window_bucket)
  dedupe_window_seconds   int         NOT NULL DEFAULT 300,

  -- Alerting
  alert_required          boolean     NOT NULL DEFAULT false,
  alert_sent              boolean     NOT NULL DEFAULT false,
  alert_sent_at           timestamptz,

  -- Resolution
  resolved                boolean     NOT NULL DEFAULT false,
  resolved_at             timestamptz,
  resolved_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note         text,

  -- Review
  reviewer                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,

  -- Integrity: prevent post-write tampering
  row_hash                text        GENERATED ALWAYS AS (
    md5(id::text || created_at::text || event_type || severity::text || summary)
  ) STORED
);

-- Indexes for query patterns used by dashboard and alert engine
CREATE INDEX IF NOT EXISTS idx_se_created         ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_severity        ON public.security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_event_type      ON public.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_user_id         ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_ip              ON public.security_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_fingerprint     ON public.security_events(fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_alert_required  ON public.security_events(alert_required, alert_sent)
  WHERE alert_required = true AND alert_sent = false;
CREATE INDEX IF NOT EXISTS idx_se_unresolved      ON public.security_events(resolved, severity)
  WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_se_category        ON public.security_events(category, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. security_alerts — one alert record per actionable notification
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,

  event_id            uuid        NOT NULL REFERENCES public.security_events(id) ON DELETE RESTRICT,
  severity            severity_level NOT NULL,
  status              alert_status   NOT NULL DEFAULT 'PENDING',

  -- Deduplication / throttling
  cooldown_until      timestamptz,
  escalation_count    int         NOT NULL DEFAULT 0,
  last_escalated_at   timestamptz,

  -- Recipient
  recipient_email     text        NOT NULL,
  subject             text        NOT NULL,
  body_html           text,
  body_text           text,

  -- Provider tracking
  provider            text,         -- resend | sendgrid
  provider_message_id text,
  provider_response   jsonb,

  -- Delivery
  sent_at             timestamptz,
  failed_at           timestamptz,
  failure_reason      text,
  retry_count         int         NOT NULL DEFAULT 0,
  next_retry_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sa_event_id    ON public.security_alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_sa_status      ON public.security_alerts(status, next_retry_at)
  WHERE status IN ('PENDING','FAILED');
CREATE INDEX IF NOT EXISTS idx_sa_severity    ON public.security_alerts(severity, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. alert_deliveries — per-attempt delivery log (audit trail for emails)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,
  alert_id            uuid        NOT NULL REFERENCES public.security_alerts(id) ON DELETE CASCADE,
  attempt_number      int         NOT NULL DEFAULT 1,
  success             boolean     NOT NULL DEFAULT false,
  provider            text,
  provider_message_id text,
  http_status         int,
  response_body       jsonb,
  error_message       text,
  duration_ms         int
);

CREATE INDEX IF NOT EXISTS idx_ad_alert_id ON public.alert_deliveries(alert_id, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. blocked_indicators — IPs, tokens, devices, users to block outright
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.blocked_indicators (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now() NOT NULL,
  expires_at      timestamptz,
  indicator_type  indicator_type NOT NULL,
  indicator_value text        NOT NULL,
  reason          text        NOT NULL,
  severity        severity_level NOT NULL,
  source_event_id uuid        REFERENCES public.security_events(id) ON DELETE SET NULL,
  added_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  active          boolean     NOT NULL DEFAULT true,
  UNIQUE(indicator_type, indicator_value)
);

CREATE INDEX IF NOT EXISTS idx_bi_type_value  ON public.blocked_indicators(indicator_type, indicator_value) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_bi_expires     ON public.blocked_indicators(expires_at) WHERE active = true;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. investigations — analyst triage workspace per incident
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.investigations (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,

  title           text        NOT NULL,
  status          investigation_status NOT NULL DEFAULT 'OPEN',
  severity        severity_level NOT NULL,

  -- Linked events (array of event IDs)
  event_ids       uuid[]      NOT NULL DEFAULT '{}',
  lead_event_id   uuid        REFERENCES public.security_events(id) ON DELETE SET NULL,

  -- Assignment
  assignee        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Triage
  summary         text,
  timeline        jsonb       NOT NULL DEFAULT '[]',  -- [{at, actor, note}]
  containment_actions jsonb   NOT NULL DEFAULT '[]',
  evidence        jsonb       NOT NULL DEFAULT '[]',

  -- Resolution
  resolved_at     timestamptz,
  false_positive  boolean     NOT NULL DEFAULT false,
  root_cause      text
);

CREATE INDEX IF NOT EXISTS idx_inv_status   ON public.investigations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_severity ON public.investigations(severity, status);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. security_configs — runtime-configurable security settings
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.security_configs (
  key             text        PRIMARY KEY,
  value           jsonb       NOT NULL,
  description     text,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed default configuration
INSERT INTO public.security_configs (key, value, description) VALUES
  ('brute_force_threshold',    '{"attempts": 5, "window_seconds": 300}',       'Failed logins before HIGH alert'),
  ('rate_limit_threshold',     '{"requests": 100, "window_seconds": 60}',       'Requests per window before alert'),
  ('max_export_rows',          '{"rows": 1000}',                                'Export row limit before alert'),
  ('alert_cooldown_seconds',   '{"HIGH": 300, "CRITICAL": 60}',                 'Per-fingerprint cooldown per severity'),
  ('escalation_threshold',     '{"repeat_count": 3, "window_seconds": 3600}',   'Repeat events before escalation'),
  ('approved_alert_email',     '"ddavis@getsnippd.com"',                        'Primary security alert recipient'),
  ('dev_tool_monitoring',      '{"enabled": true, "quarantine_untrusted": true}', 'AI/dev tool threat monitoring'),
  ('monitoring_health_check',  '{"interval_seconds": 300}',                    'How often to verify alert pipeline health')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. approved_domains — allowlist for outbound traffic and webhooks
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.approved_domains (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  domain      text    NOT NULL UNIQUE,
  purpose     text    NOT NULL,   -- webhook | api | cdn | email | package_registry
  approved_by uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  active      boolean NOT NULL DEFAULT true,
  notes       text
);

-- Seed known-good domains
INSERT INTO public.approved_domains (domain, purpose, notes) VALUES
  ('supabase.co',                  'api',              'Supabase platform'),
  ('supabase.com',                 'api',              'Supabase platform'),
  ('resend.com',                   'email',            'Transactional email provider'),
  ('sendgrid.com',                 'email',            'Transactional email fallback'),
  ('googleapis.com',               'api',              'Google AI / Gemini API'),
  ('generativelanguage.googleapis.com', 'api',         'Gemini language models'),
  ('npmjs.org',                    'package_registry', 'npm package registry'),
  ('registry.npmjs.org',           'package_registry', 'npm registry CDN'),
  ('expo.dev',                     'api',              'Expo build platform'),
  ('getsnippd.com',                'api',              'Snippd production domain')
ON CONFLICT (domain) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. suspicious_artifacts — tracks suspicious files, repos, configs, commands
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.suspicious_artifacts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now() NOT NULL,

  artifact_type   text        NOT NULL,  -- file | repo | config | command | package | env_var | endpoint
  artifact_name   text        NOT NULL,
  artifact_hash   text,                  -- sha256 if available
  artifact_path   text,

  risk            artifact_risk NOT NULL DEFAULT 'SUSPICIOUS',
  risk_reason     text        NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}',

  source_event_id uuid        REFERENCES public.security_events(id) ON DELETE SET NULL,
  reported_by     text,                  -- system | user_id | ci_cd
  quarantined_at  timestamptz,
  cleared_at      timestamptz,
  cleared_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sa_risk ON public.suspicious_artifacts(risk, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════════════════════════

-- security_events: read by admin only; insert by service_role only; NO updates (immutable)
ALTER TABLE public.security_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_indicators       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_domains         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspicious_artifacts     ENABLE ROW LEVEL SECURITY;

-- Helper: admin-only check
CREATE OR REPLACE FUNCTION public.is_security_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (preferences->>'role' = 'admin' OR preferences->>'role' = 'security_admin')
  );
$$;

-- Admins can read all security data; nobody can insert/update/delete via RLS (service_role bypasses)
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'security_events','security_alerts','alert_deliveries',
    'blocked_indicators','investigations','security_configs',
    'approved_domains','suspicious_artifacts'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "admin_read_%1$s" ON public.%1$s FOR SELECT USING (public.is_security_admin())',
      tbl
    );
  END LOOP;
END $$;

-- Investigations: admins can insert and update (for triage workflow)
CREATE POLICY "admin_manage_investigations" ON public.investigations
  FOR ALL USING (public.is_security_admin());

CREATE POLICY "admin_manage_blocked" ON public.blocked_indicators
  FOR ALL USING (public.is_security_admin());

CREATE POLICY "admin_manage_configs" ON public.security_configs
  FOR ALL USING (public.is_security_admin());

CREATE POLICY "admin_manage_domains" ON public.approved_domains
  FOR ALL USING (public.is_security_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- Check if an IP is currently blocked
CREATE OR REPLACE FUNCTION public.is_blocked(p_type indicator_type, p_value text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_indicators
    WHERE indicator_type = p_type
      AND indicator_value = p_value
      AND active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Count events within a time window for deduplication
CREATE OR REPLACE FUNCTION public.count_events_in_window(
  p_event_type text,
  p_fingerprint text,
  p_window_seconds int DEFAULT 300
)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*) FROM public.security_events
  WHERE event_type = p_event_type
    AND fingerprint = p_fingerprint
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;
$$;

-- Auto-update investigations.updated_at
CREATE OR REPLACE FUNCTION public.fn_investigations_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_investigations_updated
  BEFORE UPDATE ON public.investigations
  FOR EACH ROW EXECUTE FUNCTION public.fn_investigations_updated();

-- ══════════════════════════════════════════════════════════════════════════════
-- Retention: auto-expire LOW events after 90 days (pg_cron or manual job)
-- HIGH/CRITICAL never auto-delete
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_purge_low_severity_events()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.security_events
  SET resolved = true, resolution_note = 'Auto-expired after 90-day retention'
  WHERE severity = 'LOW'
    AND created_at < now() - interval '90 days'
    AND resolved = false;
$$;

COMMENT ON TABLE public.security_events IS
  'Immutable security event log. INSERT via service_role only. Never UPDATE core fields.';
COMMENT ON TABLE public.blocked_indicators IS
  'Active block list for IPs, tokens, device fingerprints, user IDs.';
COMMENT ON TABLE public.approved_domains IS
  'Allowlist for outbound domain calls from Edge Functions and internal tools.';
