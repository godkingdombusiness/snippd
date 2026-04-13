-- ============================================================
-- sql/08_traffic_monitoring.sql
-- Snippd Traffic Anomaly Detection + IP Reputation System
-- Run AFTER 07_security_hardening.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE: traffic_metrics
-- Rolling window request tracking per IP, user, route
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS traffic_metrics (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start   TIMESTAMPTZ NOT NULL,    -- truncated to the minute
  window_key     TEXT        NOT NULL,    -- e.g. 'ip:1.2.3.4:1min', 'user:uuid:route:/login:5min'
  metric_type    TEXT        NOT NULL,    -- ip|user|route|device|subnet|global
  dimension      TEXT        NOT NULL,    -- the actual IP / user_id / route / etc.
  route          TEXT,
  request_count  INTEGER     DEFAULT 0,
  error_count    INTEGER     DEFAULT 0,   -- 4xx + 5xx total
  auth_fail_count INTEGER    DEFAULT 0,   -- 401
  forbidden_count INTEGER    DEFAULT 0,   -- 403
  rate_limit_count INTEGER   DEFAULT 0,   -- 429
  server_err_count INTEGER   DEFAULT 0,   -- 5xx
  window_seconds INTEGER     NOT NULL,    -- 60|300|900|3600
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(window_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_traffic_window    ON traffic_metrics(window_key, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_dimension ON traffic_metrics(dimension, metric_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_route     ON traffic_metrics(route, window_start DESC) WHERE route IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- TABLE: traffic_baselines
-- Expected (normal) traffic levels per route per time window
-- Used for spike detection comparison
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS traffic_baselines (
  route                TEXT    NOT NULL,
  window_seconds       INTEGER NOT NULL,   -- 60|300|900|3600
  baseline_rps         NUMERIC NOT NULL DEFAULT 0,    -- avg requests per second
  baseline_p95         NUMERIC NOT NULL DEFAULT 0,    -- 95th percentile
  spike_threshold_mult NUMERIC NOT NULL DEFAULT 3.0,  -- alert when live > baseline * this
  max_per_minute       INTEGER NOT NULL DEFAULT 60,   -- hard cap triggers immediate alert
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(route, window_seconds)
);

-- Seed default baselines
INSERT INTO traffic_baselines(route, window_seconds, baseline_rps, spike_threshold_mult, max_per_minute) VALUES
  ('/auth/login',          60,  2.0, 3.0,  20),
  ('/auth/signup',         60,  0.5, 4.0,  10),
  ('/auth/reset-password', 60,  0.3, 4.0,   5),
  ('/close-trip',          60,  1.0, 5.0,  10),
  ('/claim-referral',      60,  0.5, 5.0,   5),
  ('/security-ingest',     60, 10.0, 4.0, 100),
  ('/gemini-proxy',        60,  3.0, 3.0,  20),
  ('/admin',               60,  0.5, 2.0,   5),
  ('GLOBAL',              300, 50.0, 3.0, 500)
ON CONFLICT(route, window_seconds) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- TABLE: rate_limit_hits
-- Log of rate limit violations for pattern analysis
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   INET,
  user_id      UUID,
  route        TEXT        NOT NULL,
  limit_type   TEXT        NOT NULL,   -- ip|user|global|route
  limit_value  INTEGER     NOT NULL,   -- the limit that was exceeded
  actual_count INTEGER     NOT NULL,   -- the actual count observed
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_hits_ip   ON rate_limit_hits(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_hits_user ON rate_limit_hits(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- TABLE: ip_reputation_cache
-- Scored IP entries with risk levels and enforcement actions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_reputation_cache (
  ip_address       INET        PRIMARY KEY,
  risk_score       INTEGER     DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level       TEXT        NOT NULL DEFAULT 'low',  -- low|medium|high|critical
  enforcement      TEXT        NOT NULL DEFAULT 'allow', -- allow|throttle|challenge|block
  is_datacenter    BOOLEAN     DEFAULT FALSE,
  is_vpn           BOOLEAN     DEFAULT FALSE,
  is_tor           BOOLEAN     DEFAULT FALSE,
  is_proxy         BOOLEAN     DEFAULT FALSE,
  country_code     TEXT,
  asn              TEXT,
  org_name         TEXT,
  auth_fail_24h    INTEGER     DEFAULT 0,
  abuse_reports    INTEGER     DEFAULT 0,
  first_seen       TIMESTAMPTZ DEFAULT NOW(),
  last_seen        TIMESTAMPTZ DEFAULT NOW(),
  last_scored_at   TIMESTAMPTZ DEFAULT NOW(),
  score_factors    JSONB       DEFAULT '{}',  -- breakdown of score components
  expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_ip_rep_risk      ON ip_reputation_cache(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_ip_rep_enforce   ON ip_reputation_cache(enforcement);
CREATE INDEX IF NOT EXISTS idx_ip_rep_expires   ON ip_reputation_cache(expires_at);

-- ─────────────────────────────────────────────────────────────
-- TABLE: anomaly_alerts
-- Fired when spike detection triggers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type      TEXT        NOT NULL,   -- login_spike|signup_spike|reward_abuse_spike|vpn_burst|ip_targeting_accounts
  severity        TEXT        NOT NULL,   -- medium|high|critical
  route           TEXT,
  dimension       TEXT,                   -- the IP / user / pattern that triggered it
  observed_value  NUMERIC     NOT NULL,
  threshold_value NUMERIC     NOT NULL,
  metadata        JSONB       DEFAULT '{}',
  email_sent      BOOLEAN     DEFAULT FALSE,
  email_sent_at   TIMESTAMPTZ,
  resolved        BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_type     ON anomaly_alerts(alert_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_unsent   ON anomaly_alerts(email_sent, severity) WHERE email_sent = FALSE;

-- ─────────────────────────────────────────────────────────────
-- TABLE: anomaly_thresholds (configurable per environment)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_thresholds (
  threshold_key        TEXT PRIMARY KEY,
  description          TEXT,
  default_value        NUMERIC NOT NULL,
  current_value        NUMERIC NOT NULL,
  unit                 TEXT,   -- requests|per_minute|per_hour|score_points
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO anomaly_thresholds(threshold_key, description, default_value, current_value, unit) VALUES
  ('login_max_per_ip_per_min',      'Max login attempts per IP per minute',          5,    5,   'requests'),
  ('login_max_per_ip_per_hour',     'Max login attempts per IP per hour',           30,   30,   'requests'),
  ('signup_max_per_ip_per_hour',    'Max new signups per IP per hour',               5,    5,   'requests'),
  ('password_reset_max_per_hour',   'Max password reset requests per IP per hour',   3,    3,   'requests'),
  ('referral_max_per_ip_per_hour',  'Max referral claims per IP per hour',           3,    3,   'requests'),
  ('reward_max_per_user_per_hour',  'Max reward claims per user per hour',           5,    5,   'requests'),
  ('global_spike_multiplier',       'Alert when route exceeds baseline × this',      3.0,  3.0, 'multiplier'),
  ('vpn_risk_weight',               'Risk score added when VPN detected',           20,   20,   'score_points'),
  ('datacenter_asn_risk_weight',    'Risk score added for datacenter ASN',          15,   15,   'score_points'),
  ('auth_fail_risk_per_event',      'Risk score added per auth failure in 24h',      5,    5,   'score_points'),
  ('ip_block_threshold',            'Risk score above which IP is blocked',         80,   80,   'score_points'),
  ('ip_challenge_threshold',        'Risk score above which IP is challenged',      60,   60,   'score_points'),
  ('ip_throttle_threshold',         'Risk score above which IP is throttled',       40,   40,   'score_points')
ON CONFLICT(threshold_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTION: get_threshold(key)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_threshold(p_key TEXT)
RETURNS NUMERIC LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT current_value FROM anomaly_thresholds WHERE threshold_key = p_key),
    (SELECT default_value FROM anomaly_thresholds WHERE threshold_key = p_key),
    0
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: record_request_metric()
-- Called by Edge Function middleware after every request
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_request_metric(
  p_ip          INET,
  p_user_id     UUID,
  p_route       TEXT,
  p_status      INTEGER,
  p_device_fp   TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_minute_start TIMESTAMPTZ := date_trunc('minute', NOW());
  v_hour_start   TIMESTAMPTZ := date_trunc('hour', NOW());
  v_is_auth_fail INTEGER := CASE WHEN p_status = 401 THEN 1 ELSE 0 END;
  v_is_forbidden INTEGER := CASE WHEN p_status = 403 THEN 1 ELSE 0 END;
  v_is_rate_lim  INTEGER := CASE WHEN p_status = 429 THEN 1 ELSE 0 END;
  v_is_server    INTEGER := CASE WHEN p_status >= 500 THEN 1 ELSE 0 END;
  v_is_error     INTEGER := CASE WHEN p_status >= 400 THEN 1 ELSE 0 END;
BEGIN
  -- Record per-IP per-route per-minute
  INSERT INTO traffic_metrics(window_start, window_key, metric_type, dimension, route, window_seconds,
    request_count, error_count, auth_fail_count, forbidden_count, rate_limit_count, server_err_count)
  VALUES(v_minute_start, 'ip:' || p_ip::TEXT || ':' || p_route || ':1min',
    'ip', p_ip::TEXT, p_route, 60, 1, v_is_error, v_is_auth_fail, v_is_forbidden, v_is_rate_lim, v_is_server)
  ON CONFLICT(window_key, window_start)
  DO UPDATE SET
    request_count   = traffic_metrics.request_count + 1,
    error_count     = traffic_metrics.error_count + EXCLUDED.error_count,
    auth_fail_count = traffic_metrics.auth_fail_count + EXCLUDED.auth_fail_count,
    forbidden_count = traffic_metrics.forbidden_count + EXCLUDED.forbidden_count,
    rate_limit_count= traffic_metrics.rate_limit_count + EXCLUDED.rate_limit_count,
    server_err_count= traffic_metrics.server_err_count + EXCLUDED.server_err_count,
    updated_at      = NOW();

  -- Record per-route per-minute (global spike detection)
  INSERT INTO traffic_metrics(window_start, window_key, metric_type, dimension, route, window_seconds, request_count)
  VALUES(v_minute_start, 'route:' || p_route || ':1min', 'route', p_route, p_route, 60, 1)
  ON CONFLICT(window_key, window_start)
  DO UPDATE SET request_count = traffic_metrics.request_count + 1, updated_at = NOW();

  -- Record per-user per-route per-hour (if authenticated)
  IF p_user_id IS NOT NULL THEN
    INSERT INTO traffic_metrics(window_start, window_key, metric_type, dimension, route, window_seconds, request_count)
    VALUES(v_hour_start, 'user:' || p_user_id::TEXT || ':' || p_route || ':1h',
      'user', p_user_id::TEXT, p_route, 3600, 1)
    ON CONFLICT(window_key, window_start)
    DO UPDATE SET request_count = traffic_metrics.request_count + 1, updated_at = NOW();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: check_rate_limit()
-- Returns TRUE if request is within limit, FALSE if exceeded
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key         TEXT,     -- 'ip:1.2.3.4' or 'user:uuid'
  p_endpoint    TEXT,
  p_max         INTEGER,
  p_window_secs INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ := NOW() - (p_window_secs || ' seconds')::INTERVAL;
BEGIN
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM traffic_metrics
  WHERE window_key = p_key || ':' || p_endpoint || ':' ||
        CASE p_window_secs
          WHEN 60   THEN '1min'
          WHEN 300  THEN '5min'
          WHEN 900  THEN '15min'
          WHEN 3600 THEN '1h'
          ELSE p_window_secs::TEXT || 's'
        END
    AND window_start >= date_trunc('minute', v_window_start);

  IF v_count >= p_max THEN
    INSERT INTO rate_limit_hits(ip_address, route, limit_type, limit_value, actual_count)
    SELECT p_key::INET, p_endpoint, 'custom', p_max, v_count
    WHERE p_key ~ '^[0-9]';  -- only insert if key looks like an IP
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: detect_route_spike()
-- Returns anomaly info if spike detected
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detect_route_spike(p_route TEXT, p_window_secs INTEGER DEFAULT 60)
RETURNS TABLE(is_spike BOOLEAN, observed INTEGER, threshold NUMERIC, severity TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_start TIMESTAMPTZ := NOW() - (p_window_secs || ' seconds')::INTERVAL;
  v_observed     INTEGER;
  v_baseline     traffic_baselines%ROWTYPE;
  v_threshold    NUMERIC;
  v_severity     TEXT;
BEGIN
  -- Get observed count
  SELECT COALESCE(SUM(request_count), 0) INTO v_observed
  FROM traffic_metrics
  WHERE metric_type = 'route'
    AND dimension = p_route
    AND window_start >= date_trunc('minute', v_window_start);

  -- Get baseline
  SELECT * INTO v_baseline FROM traffic_baselines
  WHERE route = p_route AND window_seconds = p_window_secs;

  IF NOT FOUND THEN
    is_spike := FALSE; observed := v_observed; threshold := NULL; severity := NULL;
    RETURN NEXT; RETURN;
  END IF;

  v_threshold := GREATEST(
    v_baseline.baseline_p95 * v_baseline.spike_threshold_mult,
    v_baseline.max_per_minute * (p_window_secs / 60.0)
  );

  IF v_observed > v_threshold THEN
    v_severity := CASE
      WHEN v_observed > v_threshold * 3 THEN 'critical'
      WHEN v_observed > v_threshold * 2 THEN 'high'
      ELSE 'medium'
    END;
    is_spike := TRUE;
  ELSE
    is_spike := FALSE;
    v_severity := NULL;
  END IF;

  observed := v_observed;
  threshold := v_threshold;
  severity := v_severity;
  RETURN NEXT;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: score_ip_risk()
-- Calculates and caches IP risk score
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION score_ip_risk(
  p_ip           INET,
  p_is_vpn       BOOLEAN DEFAULT FALSE,
  p_is_datacenter BOOLEAN DEFAULT FALSE,
  p_is_tor       BOOLEAN DEFAULT FALSE,
  p_country_code TEXT    DEFAULT NULL,
  p_asn          TEXT    DEFAULT NULL
) RETURNS ip_reputation_cache LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_score         INTEGER := 0;
  v_auth_fails    INTEGER;
  v_rate_hits     INTEGER;
  v_fraud_links   INTEGER;
  v_factors       JSONB := '{}';
  v_enforcement   TEXT;
  v_risk_level    TEXT;
  v_cached        ip_reputation_cache%ROWTYPE;
BEGIN
  -- Check cache (valid for 1h unless it's a known bad IP)
  SELECT * INTO v_cached FROM ip_reputation_cache
  WHERE ip_address = p_ip AND last_scored_at > NOW() - INTERVAL '1 hour';
  IF FOUND AND v_cached.risk_score >= 80 THEN RETURN v_cached; END IF;  -- bad IPs re-scored hourly

  -- Factor 1: Auth failures in last 24h
  SELECT COALESCE(SUM(auth_fail_count), 0) INTO v_auth_fails
  FROM traffic_metrics
  WHERE dimension = p_ip::TEXT AND metric_type = 'ip'
    AND window_start > NOW() - INTERVAL '24 hours';
  v_score := v_score + LEAST(v_auth_fails * 5, 40);  -- max 40pts from auth fails
  v_factors := v_factors || jsonb_build_object('auth_fails_24h', v_auth_fails, 'pts', LEAST(v_auth_fails * 5, 40));

  -- Factor 2: Rate limit violations
  SELECT COUNT(*) INTO v_rate_hits FROM rate_limit_hits
  WHERE ip_address = p_ip AND created_at > NOW() - INTERVAL '24 hours';
  v_score := v_score + LEAST(v_rate_hits * 5, 20);
  v_factors := v_factors || jsonb_build_object('rate_hits_24h', v_rate_hits, 'pts', LEAST(v_rate_hits * 5, 20));

  -- Factor 3: VPN/Proxy
  IF p_is_vpn THEN
    v_score := v_score + get_threshold('vpn_risk_weight')::INTEGER;
    v_factors := v_factors || jsonb_build_object('vpn', TRUE, 'pts', get_threshold('vpn_risk_weight'));
  END IF;

  -- Factor 4: Datacenter ASN
  IF p_is_datacenter THEN
    v_score := v_score + get_threshold('datacenter_asn_risk_weight')::INTEGER;
    v_factors := v_factors || jsonb_build_object('datacenter', TRUE, 'pts', get_threshold('datacenter_asn_risk_weight'));
  END IF;

  -- Factor 5: TOR
  IF p_is_tor THEN
    v_score := v_score + 40;
    v_factors := v_factors || jsonb_build_object('tor', TRUE, 'pts', 40);
  END IF;

  -- Factor 6: Associated with fraud flags
  SELECT COUNT(*) INTO v_fraud_links
  FROM fraud_flags ff
  JOIN referral_verifications rv ON rv.referral_id IS NOT NULL
  WHERE rv.ip_address = p_ip AND ff.created_at > NOW() - INTERVAL '7 days';
  v_score := v_score + LEAST(v_fraud_links * 10, 30);

  -- Clamp score
  v_score := LEAST(v_score, 100);

  -- Determine enforcement action
  IF v_score >= get_threshold('ip_block_threshold') THEN
    v_enforcement := 'block'; v_risk_level := 'critical';
  ELSIF v_score >= get_threshold('ip_challenge_threshold') THEN
    v_enforcement := 'challenge'; v_risk_level := 'high';
  ELSIF v_score >= get_threshold('ip_throttle_threshold') THEN
    v_enforcement := 'throttle'; v_risk_level := 'medium';
  ELSE
    v_enforcement := 'allow'; v_risk_level := 'low';
  END IF;

  -- Upsert into cache
  INSERT INTO ip_reputation_cache(ip_address, risk_score, risk_level, enforcement,
    is_datacenter, is_vpn, is_tor, country_code, asn,
    last_seen, last_scored_at, score_factors, expires_at)
  VALUES(p_ip, v_score, v_risk_level, v_enforcement,
    p_is_datacenter, p_is_vpn, p_is_tor, p_country_code, p_asn,
    NOW(), NOW(), v_factors, NOW() + INTERVAL '1 hour')
  ON CONFLICT(ip_address) DO UPDATE SET
    risk_score     = EXCLUDED.risk_score,
    risk_level     = EXCLUDED.risk_level,
    enforcement    = EXCLUDED.enforcement,
    is_vpn         = EXCLUDED.is_vpn,
    is_datacenter  = EXCLUDED.is_datacenter,
    is_tor         = EXCLUDED.is_tor,
    last_seen      = NOW(),
    last_scored_at = NOW(),
    score_factors  = EXCLUDED.score_factors,
    expires_at     = EXCLUDED.expires_at
  RETURNING * INTO v_cached;

  RETURN v_cached;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: should_block_request()
-- Combined check: blocked_indicators + IP reputation
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION should_block_request(p_ip INET, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(should_block BOOLEAN, enforcement TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_ip_rep ip_reputation_cache%ROWTYPE;
  v_is_blocked BOOLEAN;
BEGIN
  -- Check explicit blocks first
  SELECT EXISTS(
    SELECT 1 FROM blocked_indicators
    WHERE indicator_type = 'IP'
      AND indicator_value = p_ip::TEXT
      AND active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_is_blocked;

  IF v_is_blocked THEN
    should_block := TRUE; enforcement := 'block'; reason := 'explicit_block';
    RETURN NEXT; RETURN;
  END IF;

  -- Check user-level block
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM fraud_flags
      WHERE user_id = p_user_id AND auto_blocked = TRUE AND resolved_at IS NULL
    ) INTO v_is_blocked;
    IF v_is_blocked THEN
      should_block := TRUE; enforcement := 'block'; reason := 'user_fraud_block';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Check IP reputation cache
  SELECT * INTO v_ip_rep FROM ip_reputation_cache WHERE ip_address = p_ip;
  IF FOUND AND v_ip_rep.enforcement != 'allow' THEN
    should_block := v_ip_rep.enforcement = 'block';
    enforcement := v_ip_rep.enforcement;
    reason := 'ip_reputation_score_' || v_ip_rep.risk_score::TEXT;
    RETURN NEXT; RETURN;
  END IF;

  should_block := FALSE; enforcement := 'allow'; reason := 'ok';
  RETURN NEXT;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: expire_blocks()
-- Run by pg_cron every 30 minutes
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_blocks() RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE blocked_indicators
  SET active = FALSE
  WHERE active = TRUE AND expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE ip_reputation_cache
  SET enforcement = 'allow', risk_level = 'low', risk_score = GREATEST(risk_score - 20, 0)
  WHERE enforcement = 'block' AND expires_at < NOW();

  INSERT INTO cron_audit_log(action, job_name, result)
  VALUES('executed', 'expire-blocks', 'expired ' || v_count || ' blocks');

  RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- CRON: Schedule expire_blocks and metric cleanup
-- ─────────────────────────────────────────────────────────────
SELECT cron.schedule('expire-blocks', '*/30 * * * *', $$SELECT expire_blocks()$$)
ON CONFLICT(jobname) DO NOTHING;

SELECT cron.schedule('cleanup-traffic-metrics', '0 2 * * *',
  $$DELETE FROM traffic_metrics WHERE window_start < NOW() - INTERVAL '7 days'$$)
ON CONFLICT(jobname) DO NOTHING;

SELECT cron.schedule('cleanup-anomaly-alerts', '0 5 * * *',
  $$DELETE FROM anomaly_alerts WHERE created_at < NOW() - INTERVAL '30 days' AND resolved = TRUE$$)
ON CONFLICT(jobname) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES for new tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE traffic_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_baselines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_hits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_reputation_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_thresholds    ENABLE ROW LEVEL SECURITY;

-- Only security admins can read these tables
CREATE POLICY "traffic_metrics_admin"     ON traffic_metrics     FOR SELECT USING (is_security_admin());
CREATE POLICY "traffic_baselines_admin"   ON traffic_baselines   FOR SELECT USING (is_security_admin());
CREATE POLICY "rate_limit_hits_admin"     ON rate_limit_hits     FOR SELECT USING (is_security_admin());
CREATE POLICY "ip_reputation_admin"       ON ip_reputation_cache FOR SELECT USING (is_security_admin());
CREATE POLICY "anomaly_alerts_admin"      ON anomaly_alerts      FOR SELECT USING (is_security_admin());
CREATE POLICY "anomaly_thresholds_admin"  ON anomaly_thresholds  FOR SELECT USING (is_security_admin());
-- No client writes to any of these tables
