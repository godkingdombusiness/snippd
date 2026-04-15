-- Migration 015: Nutrition profile columns
-- Must run BEFORE 016_get_weekly_plan_fn.sql which queries these columns
-- 2026-04-14

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS household_members         jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_calorie_target_min  integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_calorie_target_max  integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meal_calorie_target_min   integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meal_calorie_target_max   integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dietary_modes             text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nutrition_profile_set     boolean  DEFAULT false;

-- household_members JSONB array shape:
-- [
--   { "role": "adult_woman_19_50", "age_group": "19-50", "sex": "female",
--     "kcal_min": 1800, "kcal_max": 2000 },
--   { "role": "child_4_8", "age_group": "4-8", "sex": "either",
--     "kcal_min": 1200, "kcal_max": 1600 }
-- ]
--
-- dietary_modes text[] values:
-- 'plant_based' | 'low_carb' | 'low_sodium' | 'healthy_fats'
-- 'high_protein' | 'mediterranean' | 'keto' | 'diabetic_friendly'
