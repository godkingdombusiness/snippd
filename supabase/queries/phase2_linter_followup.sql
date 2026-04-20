-- Run against your Supabase project (SQL editor) before Phase 2 migrations.
-- Use results to author targeted migrations; do not auto-apply blind bulk fixes.

-- -----------------------------------------------------------------------------
-- Section 1a — All public functions missing search_path (includes vector/pg_trgm)
-- Most rows are extension-owned; do not ALTER those one-by-one — move extensions
-- to schema `extensions` when you tackle lint 0014.
-- -----------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) as cfg(opt)
    where opt like 'search_path=%'
  )
order by 1, 2;

-- -----------------------------------------------------------------------------
-- Section 1b — Custom functions only (NOT extension members; matches migration
-- 20260419130000_function_search_path_custom_public.sql). Re-run after that migration;
-- expect zero rows once custom functions are fixed.
-- -----------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (
    select 1
    from pg_catalog.pg_depend d
    where d.objid = p.oid
      and d.deptype = 'e'
  )
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) as cfg(opt)
    where opt like 'search_path=%'
  )
order by 1, 2;

-- -----------------------------------------------------------------------------
-- Policies that likely need auth_rls_initplan fix (auth.* not wrapped in subselect)
-- Manual review: rewrite auth.uid() -> (select auth.uid()) in USING / WITH CHECK.
-- -----------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname not in ('pg_catalog', 'information_schema')
  and (
    coalesce(qual, '') ~ '(^|[^a-z_])auth\.(uid|jwt|role)\('
    or coalesce(with_check, '') ~ '(^|[^a-z_])auth\.(uid|jwt|role)\('
  )
  and not (
    coalesce(qual, '') ~* '\(\s*select\s+auth\.'
    or coalesce(with_check, '') ~* '\(\s*select\s+auth\.'
  )
order by schemaname, tablename, policyname;

-- -----------------------------------------------------------------------------
-- Tables with RLS on and zero policies (Splinter 0008) — check view dependencies first.
-- If any are referenced by views your app reads, do NOT add blind deny policies without analysis.
-- -----------------------------------------------------------------------------
select
  n.nspname as schema_name,
  c.relname as table_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
  and c.relrowsecurity = true
  and not exists (
    select 1
    from pg_catalog.pg_policies pol
    where pol.schemaname = n.nspname
      and pol.tablename = c.relname
  )
order by 1, 2;

-- -----------------------------------------------------------------------------
-- Views that use a given table (edit table_name). Run before adding deny-all RLS policies.
-- -----------------------------------------------------------------------------
select distinct table_schema as source_schema, table_name as source_table,
  view_schema as dependent_schema, view_name as dependent_view
from information_schema.view_table_usage
where table_schema = 'public'
  and table_name = 'anonymized_signals';
