-- Lint 0008 (rls_enabled_no_policy): tables had RLS on but zero policies.
-- Splinter wants explicit intent. These policies deny **client** roles (anon, authenticated).
-- `service_role` and superuser bypass RLS — backend jobs / SQL editor keep full access.
--
-- Before applying: if any SECURITY INVOKER view exposed to the app selects from these tables,
-- client queries could see zero rows. Run view checks in phase2_linter_followup.sql if unsure.
-- App surfaces in this repo do not reference these tables directly.
--
-- Source: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

do $deny$
declare
  t text;
  tables text[] := array[
    'anonymized_signals',
    'creator_profiles',
    'event_weight_config',
    'meal_prep_strategies',
    'model_predictions',
    'rebate_offers',
    'weekly_ad_files'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t
        and c.relkind = 'r'
        and c.relrowsecurity = true
    )
    and not exists (
      select 1
      from pg_catalog.pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = t
    ) then
      execute format(
        $f$
          create policy "0008_no_client_access_anon"
          on public.%I
          for all
          to anon
          using (false)
          with check (false);
        $f$,
        t
      );
      execute format(
        $f$
          create policy "0008_no_client_access_authenticated"
          on public.%I
          for all
          to authenticated
          using (false)
          with check (false);
        $f$,
        t
      );
    end if;
  end loop;
end;
$deny$;
