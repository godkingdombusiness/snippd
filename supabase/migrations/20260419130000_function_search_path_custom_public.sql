-- Lint 0011 (function_search_path_mutable): set a fixed search_path on **custom**
-- public functions only — i.e. functions that are NOT members of an installed extension.
--
-- Rationale: vector, pg_trgm, etc. install hundreds of functions into public; altering each
-- is brittle (extension upgrades may replace them). Fix those via
-- `ALTER EXTENSION ... SET SCHEMA extensions` (separate migration after updating callers).
--
-- This migration matches objects Splinter flags that are actually under your control.
-- search_path: public + pg_temp (Supabase docs pattern; pg_catalog remains searchable per PG rules).

do $set_search_path$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
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
  loop
    execute format('alter function %s set search_path to public, pg_temp', r.fn);
  end loop;
end;
$set_search_path$;
