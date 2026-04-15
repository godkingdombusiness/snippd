-- Migration 016: get_weekly_plan RPC function
-- Depends on 015_nutrition_profile.sql (meal_calorie_target_min/max, dietary_modes columns)
-- 2026-04-14

CREATE OR REPLACE FUNCTION public.get_weekly_plan(
  p_user_id       uuid,
  p_headcount     integer  DEFAULT 4,
  p_nights        integer  DEFAULT 5,
  p_focus         text     DEFAULT 'none',
  p_week_of       date     DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dietary_tags    text[]  := ARRAY[]::text[];
  v_dietary_modes   text[]  := ARRAY[]::text[];
  v_health_focus    text    := 'none';
  v_weekly_budget   integer := 15000;
  v_meal_cal_min    integer;
  v_meal_cal_max    integer;
  v_result          jsonb;
BEGIN

  -- Load user profile (profiles keyed by user_id = auth user id)
  SELECT
    COALESCE(p.dietary_tags,  ARRAY[]::text[]),
    COALESCE(p.dietary_modes, ARRAY[]::text[]),
    COALESCE(p.preferences->>'health_focus', 'none'),
    COALESCE(p.weekly_budget, 15000),
    p.meal_calorie_target_min,
    p.meal_calorie_target_max
  INTO
    v_dietary_tags,
    v_dietary_modes,
    v_health_focus,
    v_weekly_budget,
    v_meal_cal_min,
    v_meal_cal_max
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  -- Build full plan as single JSON expression
  SELECT jsonb_build_object(
    'week_of',                  p_week_of,
    'headcount',                p_headcount,
    'nights',                   p_nights,
    'focus',                    p_focus,
    'health_focus',             v_health_focus,
    'weekly_budget',            v_weekly_budget,
    'meal_calorie_target_min',  v_meal_cal_min,
    'meal_calorie_target_max',  v_meal_cal_max,
    'dietary_modes',            to_jsonb(v_dietary_modes),

    -- ── Dinner slots: protein + produce side + pantry item per night ──
    'dinners', (
      WITH filtered AS (
        SELECT
          sc.*,
          CASE p_focus
            WHEN 'savings' THEN COALESCE(sc.stack_rank_score, 0) * 1.5
            WHEN 'protein' THEN COALESCE(sc.protein_g, 0) / 50.0
            ELSE                 COALESCE(sc.stack_rank_score, 0)
          END AS sort_score
        FROM public.stack_candidates sc
        WHERE sc.is_active = true
          AND (sc.valid_to   IS NULL OR sc.valid_to   >= p_week_of)
          AND (sc.valid_from IS NULL OR sc.valid_from <= p_week_of + 7)
          -- Exclude items where food allergen_tags overlap with user dietary_tags
          AND NOT (
            sc.allergen_tags IS NOT NULL
            AND sc.allergen_tags != 'null'::jsonb
            AND jsonb_typeof(sc.allergen_tags) = 'array'
            AND jsonb_array_length(sc.allergen_tags) > 0
            AND array_length(v_dietary_tags, 1) > 0
            AND sc.allergen_tags ?| v_dietary_tags
          )
      ),
      proteins AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY sort_score DESC) AS rn
        FROM filtered
        WHERE category IN ('meat', 'seafood', 'deli')
      ),
      produce AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY sort_score DESC) AS rn
        FROM filtered
        WHERE category = 'produce'
      ),
      pantry_items AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY sort_score DESC) AS rn
        FROM filtered
        WHERE category IN ('pantry', 'bakery', 'frozen', 'dairy')
      )
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'night',       CASE n
                             WHEN 1 THEN 'Monday'
                             WHEN 2 THEN 'Tuesday'
                             WHEN 3 THEN 'Wednesday'
                             WHEN 4 THEN 'Thursday'
                             WHEN 5 THEN 'Friday'
                             WHEN 6 THEN 'Saturday'
                             WHEN 7 THEN 'Sunday'
                           END,
            'night_index', n,
            'protein',     (SELECT row_to_json(p.*) FROM proteins p WHERE p.rn = n),
            'side',        (SELECT row_to_json(pr.*) FROM produce pr WHERE pr.rn = n),
            'pantry_item', (SELECT row_to_json(pa.*) FROM pantry_items pa WHERE pa.rn = n)
          )
        ),
        '[]'::jsonb
      )
      FROM generate_series(1, p_nights) AS n
    ),

    -- ── Household stack: top 8 household/health items ─────────────────
    'household_stack', (
      WITH hh AS (
        SELECT sc.*,
          COALESCE(sc.stack_rank_score, 0) AS sort_score
        FROM public.stack_candidates sc
        WHERE sc.is_active = true
          AND (sc.valid_to IS NULL OR sc.valid_to >= p_week_of)
          AND sc.category IN ('household', 'health', 'personal_care')
        ORDER BY sort_score DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(row_to_json(hh.*)), '[]'::jsonb)
      FROM hh
    ),

    -- ── Totals ────────────────────────────────────────────────────────
    'totals', (
      SELECT jsonb_build_object(
        'regular_total',  COALESCE(SUM(sc.base_price),  0),
        'sale_total',     COALESCE(SUM(sc.final_price), 0),
        'total_savings',  COALESCE(SUM(sc.base_price) - SUM(sc.final_price), 0)
      )
      FROM public.stack_candidates sc
      WHERE sc.is_active = true
        AND (sc.valid_to IS NULL OR sc.valid_to >= p_week_of)
        AND sc.category NOT IN ('household', 'health', 'personal_care')
    ),

    'data_source', 'live'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_plan TO service_role;
