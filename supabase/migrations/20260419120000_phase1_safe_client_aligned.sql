-- Phase 1 — safe, client-aligned linter fixes (no RLS semantics changes here).
--
-- Client contract: anon-key Supabase JS usage in this repo touches:
--   public.current_mission (read/write), public.profiles (read), public.trips (read/insert),
--   public.v_active_offers (read), storage bucket ugc-videos (upload).
-- Helpers also reference public.weekly_stacks, public.donation_pledges (may be unused in UI).
-- Ingest scripts (service role): stashd_items, stashd_coupons — not covered here.
--
-- This migration:
--   1) Sets security_invoker on public.v_active_offers (lint 0010), matching 20260418140000.
--   2) Drops redundant public.profiles_user_id_idx when public.profiles_user_id_unique exists (lint 0009).
--
-- Deferred (requires live DB introspection + review): function search_path, RLS policy merges,
-- auth_rls_initplan rewrites, extension relocation, explicit policies on internal tables,
-- FK indexes that 20260418120000 intentionally dropped as unused — see supabase/queries/phase2_linter_followup.sql

-- -----------------------------------------------------------------------------
-- 1) v_active_offers: enforce security invoker so RLS applies to the querying user (PG15+).
-- -----------------------------------------------------------------------------
do $v_active_offers_invoker$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_active_offers'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.v_active_offers set (security_invoker = true)';
  end if;
end;
$v_active_offers_invoker$;

-- -----------------------------------------------------------------------------
-- 2) Duplicate btree on profiles.user_id: keep constraint-backed unique index only.
-- -----------------------------------------------------------------------------
do $profiles_dup_idx$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'profiles'
      and indexname = 'profiles_user_id_idx'
  )
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'profiles'
      and indexname = 'profiles_user_id_unique'
  ) then
    execute 'drop index if exists public.profiles_user_id_idx';
  end if;
end;
$profiles_dup_idx$;
