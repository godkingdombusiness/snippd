-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — API Rate Limiting via Postgres
-- Uses the existing api_rate_limit_log table (already in your schema).
-- Do NOT recreate api_quota_log — that table tracks daily points, not per-user
-- per-endpoint requests, and has a different schema.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Index on existing api_rate_limit_log (add if missing) ────────────────────
-- Your schema: api_rate_limit_log(id bigint, user_id uuid, endpoint text, request_at timestamptz)
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint_time
  ON public.api_rate_limit_log (user_id, endpoint, request_at DESC);

-- RLS on the existing table
ALTER TABLE public.api_rate_limit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_insert_own" ON public.api_rate_limit_log;
CREATE POLICY "rate_limit_insert_own"
  ON public.api_rate_limit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rate_limit_no_select" ON public.api_rate_limit_log;
CREATE POLICY "rate_limit_no_select"
  ON public.api_rate_limit_log FOR SELECT
  TO authenticated
  USING (false);


-- ── Rate-limit checker function ───────────────────────────────────────────────
-- Returns JSON { allowed: bool, remaining: int, reset_at: timestamptz }
-- Inserts a row into api_rate_limit_log only when allowed=true.
--
-- Parameters:
--   p_user_id        uuid   — the calling user
--   p_endpoint       text   — logical endpoint name (e.g. 'gemini_generate')
--   p_daily_limit    int    — max requests per rolling window (default 50)
--   p_window_seconds int    — rolling window size in seconds (default 86400 = 1 day)

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id        uuid,
  p_endpoint       text,
  p_daily_limit    int  DEFAULT 50,
  p_window_seconds int  DEFAULT 86400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start  timestamptz;
  v_count         int;
  v_oldest        timestamptz;
  v_reset_at      timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Count requests in the current rolling window
  SELECT COUNT(*), MIN(request_at)
  INTO v_count, v_oldest
  FROM public.api_rate_limit_log
  WHERE user_id   = p_user_id
    AND endpoint  = p_endpoint
    AND request_at > v_window_start;

  -- When the oldest in-window request ages out, the window resets
  v_reset_at := COALESCE(v_oldest, now()) + (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed',   false,
      'remaining', 0,
      'reset_at',  v_reset_at
    );
  END IF;

  -- Log the allowed request
  INSERT INTO public.api_rate_limit_log (user_id, endpoint)
  VALUES (p_user_id, p_endpoint);

  RETURN jsonb_build_object(
    'allowed',   true,
    'remaining', p_daily_limit - v_count - 1,
    'reset_at',  v_reset_at
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit IS
  'Rate limiter using api_rate_limit_log. Returns {allowed, remaining, reset_at}.';


-- ── Usage (Supabase Edge Function) ────────────────────────────────────────────
-- const { data } = await supabase.rpc('check_rate_limit', {
--   p_user_id:     userId,
--   p_endpoint:    'gemini_generate',
--   p_daily_limit: 25,
-- });
-- if (!data.allowed) return new Response('Too Many Requests', { status: 429 });
