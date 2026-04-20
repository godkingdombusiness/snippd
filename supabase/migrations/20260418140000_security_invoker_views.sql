-- Lint 0010 (security_definer_view): public views exposed to anon/authenticated
-- should use security_invoker so RLS and grants apply as the querying user (PG 15+).
-- See: https://github.com/supabase/splinter/blob/main/lints/0010_security_definer_view.sql

alter view public.v_weekly_savings_summary set (security_invoker = true);
alter view public.v_recommendation_funnel set (security_invoker = true);
alter view public.v_stack_performance set (security_invoker = true);
