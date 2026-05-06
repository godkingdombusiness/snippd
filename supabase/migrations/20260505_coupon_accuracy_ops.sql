-- Coupon accuracy operations.
-- Adds a small health surface and pg_cron schedule for the verified-only coupon gate.

drop function if exists public.get_coupon_accuracy_health();
drop view if exists public.v_coupon_accuracy_health;

create or replace view public.v_coupon_accuracy_health as
select
  now() as checked_at,
  (
    select count(*)::int
    from public.retailer_coupon_sources
    where is_active = true
  ) as active_source_count,
  (
    select count(*)::int
    from public.v_live_verified_digital_coupons
  ) as live_verified_coupon_count,
  (
    select count(*)::int
    from public.retailer_coupon_sources
    where is_active = true
      and source_type not in ('json_coupon_feed', 'retailer_api_json', 'dollar_general_public_api')
  ) as adapter_required_source_count,
  (
    select max(verified_at)
    from public.digital_coupon_evidence
    where verification_status = 'verified'
  ) as latest_verified_at,
  (
    select count(*)::int
    from public.digital_coupon_evidence
    where verification_status in ('stale', 'expired', 'hidden')
       or (expiration_date is not null and expiration_date < current_date)
       or (expires_at is not null and expires_at <= now())
  ) as hidden_stale_or_expired_count,
  (
    select count(*)::int
    from public.coupon_refresh_runs
    where started_at >= now() - interval '24 hours'
      and status in ('failed', 'partial')
  ) as failed_or_partial_runs_24h,
  (
    select status
    from public.coupon_refresh_runs
    order by started_at desc
    limit 1
  ) as last_refresh_status,
  (
    select started_at
    from public.coupon_refresh_runs
    order by started_at desc
    limit 1
  ) as last_refresh_started_at,
  (
    select finished_at
    from public.coupon_refresh_runs
    order by started_at desc
    limit 1
  ) as last_refresh_finished_at,
  (
    select error_message
    from public.coupon_refresh_runs
    order by started_at desc
    limit 1
  ) as last_refresh_error,
  case
    when (
      select count(*)
      from public.retailer_coupon_sources
      where is_active = true
    ) = 0 then 'no_active_sources'
    when (
      select count(*)
      from public.retailer_coupon_sources
      where is_active = true
        and source_type not in ('json_coupon_feed', 'retailer_api_json', 'dollar_general_public_api')
    ) > 0 then 'coupon_adapters_required'
    when (
      select count(*)
      from public.v_live_verified_digital_coupons
    ) = 0 then 'no_live_verified_coupons'
    when (
      select max(verified_at)
      from public.digital_coupon_evidence
      where verification_status = 'verified'
    ) < now() - interval '12 hours' then 'verified_coupon_evidence_stale'
    when (
      select count(*)
      from public.coupon_refresh_runs
      where started_at >= now() - interval '24 hours'
        and status = 'failed'
    ) > 0 then 'recent_refresh_failures'
    else 'healthy'
  end as status;

-- PostgREST upsert requires a non-partial unique index for onConflict.
-- Multiple NULL evidence_hash values remain allowed by PostgreSQL uniqueness.
create unique index if not exists digital_coupon_evidence_hash_all_uidx
  on public.digital_coupon_evidence (evidence_hash);

comment on view public.v_coupon_accuracy_health is
  'Operational health view for the verified-only coupon evidence gate.';

create or replace function public.get_coupon_accuracy_health()
returns public.v_coupon_accuracy_health
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.v_coupon_accuracy_health
  limit 1;
$$;

grant execute on function public.get_coupon_accuracy_health() to authenticated;

-- Schedule the refresh runner when pg_cron/net are available. This is safe to
-- re-run: it removes the prior schedule and recreates it.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      perform cron.unschedule('snippd-coupon-refresh');
    exception
      when others then
        null;
    end;
    perform cron.schedule(
      'snippd-coupon-refresh',
      '17 * * * *',
      $job$
      select
        net.http_post(
          url := current_setting('app.supabase_functions_url') || '/run-coupon-refresh',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'snippd_cron_secret')
          ),
          body := jsonb_build_object('mode', 'scheduled')
        );
      $job$
    );
  end if;
exception
  when others then
    raise notice 'Skipping snippd-coupon-refresh schedule: %', sqlerrm;
end $$;
