-- Retailer policy registry for the Snippd ADK agent.
--
-- Provides a single source of truth for retailer rules that affect deal
-- assembly (coupon acceptance, price match, rebate compatibility, rewards,
-- regional quirks, disclosures, returns, ad cycle, hours, delivery, etc.).
--
-- Design principles:
--   * Every policy is keyed by (store_id, policy_type, policy_key).
--   * value_json is free-form jsonb so new fields don't require migrations.
--   * A sha256 content_hash detects drift and powers change detection.
--   * An UPDATE trigger writes the old row to retailer_policy_history so we
--     retain a full audit trail (who/when/what changed, with source URL).
--   * Views expose "current" and "stale" slices for the ADK agents.
--   * RPC functions give agents safe, parameterized ways to read/write.
--
-- Safe to re-run: everything uses `create ... if not exists` /
-- `create or replace` / `on conflict do update`.

-- ---------------------------------------------------------------------------
-- 0) Prereqs: pgcrypto for digest() used in the content hash.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Canonical enum-ish check of policy_type (kept as text + CHECK for
--    flexibility; new types just need a code change here).
-- ---------------------------------------------------------------------------
-- Policy type vocabulary (extend as needed):
--   coupon_acceptance   : manufacturer / internet / digital / competitor coupon rules
--   coupon_stacking     : manufacturer + store + rebate stacking mechanics
--   coupon_limits       : per-transaction / like-coupon / clip caps
--   price_match         : who they match, scope, online-vs-store
--   price_adjustment    : refund window if price drops after purchase
--   rebate_compat       : Ibotta / Fetch / Checkout 51 / own-app compatibility
--   rewards_program     : loyalty program mechanics
--   loyalty_required    : is a member card required for digital coupons / sale prices
--   regional_quirks     : state- or chain-specific oddities (e.g. Publix BOGO-on-one)
--   disclosures         : SNAP/EBT, WIC, alcohol, age-restricted, tax rules
--   returns             : return window & conditions
--   ad_cycle            : weekly ad flip day, sale cycle length
--   hours_and_access    : senior hours, member early access, 24-hr locations
--   delivery_pickup     : Instacart / DoorDash / Shipt / own-service coverage
--   substitutions       : out-of-stock substitution rules
--   bulk_purchase_limits: per-item buy caps during promos

-- ---------------------------------------------------------------------------
-- 2) Main table.
-- ---------------------------------------------------------------------------
create table if not exists public.retailer_policies (
  id               uuid primary key default gen_random_uuid(),
  store_id         text not null references public.stores(id) on update cascade,
  policy_type      text not null check (policy_type in (
    'coupon_acceptance','coupon_stacking','coupon_limits',
    'price_match','price_adjustment','rebate_compat',
    'rewards_program','loyalty_required','regional_quirks',
    'disclosures','returns','ad_cycle','hours_and_access',
    'delivery_pickup','substitutions','bulk_purchase_limits'
  )),
  policy_key       text not null,
  value_json       jsonb not null default '{}'::jsonb,
  summary          text,
  source_url       text,
  source_snippet   text,
  effective_date   date,
  last_verified_at timestamptz not null default now(),
  verified_by      text not null default 'Retailer_Policy_Curator',
  confidence       numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  content_hash     text generated always as (
    encode(extensions.digest(coalesce(value_json::text, ''), 'sha256'), 'hex')
  ) stored,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint retailer_policies_uq
    unique (store_id, policy_type, policy_key)
);

create index if not exists idx_retailer_policies_store_type
  on public.retailer_policies (store_id, policy_type);

create index if not exists idx_retailer_policies_last_verified
  on public.retailer_policies (last_verified_at desc);

-- ---------------------------------------------------------------------------
-- 3) History / audit trail.
-- ---------------------------------------------------------------------------
create table if not exists public.retailer_policy_history (
  id               bigserial primary key,
  policy_id        uuid not null,
  store_id         text not null,
  policy_type      text not null,
  policy_key       text not null,
  value_json       jsonb,
  summary          text,
  source_url       text,
  source_snippet   text,
  effective_date   date,
  verified_by      text,
  confidence       numeric(3,2),
  content_hash     text,
  change_kind      text not null check (change_kind in ('insert','update','delete','hash_change')),
  changed_at       timestamptz not null default now()
);

create index if not exists idx_retailer_policy_history_policy
  on public.retailer_policy_history (policy_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 4) Trigger: record insert/update/delete into history, always with the *old*
--    state on update/delete and the *new* state on insert.
-- ---------------------------------------------------------------------------
create or replace function public.retailer_policies_log_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.retailer_policy_history(
      policy_id, store_id, policy_type, policy_key, value_json,
      summary, source_url, source_snippet, effective_date,
      verified_by, confidence, content_hash, change_kind
    ) values (
      new.id, new.store_id, new.policy_type, new.policy_key, new.value_json,
      new.summary, new.source_url, new.source_snippet, new.effective_date,
      new.verified_by, new.confidence, new.content_hash, 'insert'
    );
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.content_hash is distinct from new.content_hash) then
      insert into public.retailer_policy_history(
        policy_id, store_id, policy_type, policy_key, value_json,
        summary, source_url, source_snippet, effective_date,
        verified_by, confidence, content_hash, change_kind
      ) values (
        old.id, old.store_id, old.policy_type, old.policy_key, old.value_json,
        old.summary, old.source_url, old.source_snippet, old.effective_date,
        old.verified_by, old.confidence, old.content_hash, 'hash_change'
      );
    end if;
    new.updated_at := now();
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.retailer_policy_history(
      policy_id, store_id, policy_type, policy_key, value_json,
      summary, source_url, source_snippet, effective_date,
      verified_by, confidence, content_hash, change_kind
    ) values (
      old.id, old.store_id, old.policy_type, old.policy_key, old.value_json,
      old.summary, old.source_url, old.source_snippet, old.effective_date,
      old.verified_by, old.confidence, old.content_hash, 'delete'
    );
    return old;
  end if;
  return null;
end
$$;

drop trigger if exists trg_retailer_policies_log on public.retailer_policies;
create trigger trg_retailer_policies_log
  after insert or update or delete on public.retailer_policies
  for each row execute function public.retailer_policies_log_change();

-- ---------------------------------------------------------------------------
-- 5) Views: current + staleness.
-- ---------------------------------------------------------------------------
create or replace view public.v_retailer_policy_current
with (security_invoker = on) as
select
  rp.id,
  rp.store_id,
  s.name as store_name,
  rp.policy_type,
  rp.policy_key,
  rp.value_json,
  rp.summary,
  rp.source_url,
  rp.effective_date,
  rp.last_verified_at,
  rp.confidence,
  rp.content_hash
from public.retailer_policies rp
join public.stores s on s.id = rp.store_id
where rp.is_active = true
order by rp.store_id, rp.policy_type, rp.policy_key;

comment on view public.v_retailer_policy_current is
  'Snippd agent — active retailer policies joined with store names.';

create or replace view public.v_retailer_policy_staleness
with (security_invoker = on) as
select
  rp.store_id,
  rp.policy_type,
  rp.policy_key,
  rp.last_verified_at,
  (now() - rp.last_verified_at) as age,
  case
    when rp.last_verified_at < now() - interval '90 days' then 'stale'
    when rp.last_verified_at < now() - interval '30 days' then 'aging'
    else 'fresh'
  end as freshness
from public.retailer_policies rp
where rp.is_active = true;

comment on view public.v_retailer_policy_staleness is
  'Snippd agent — buckets each policy into fresh / aging / stale for refresh scheduling.';

-- ---------------------------------------------------------------------------
-- 6) RPC functions for the agents (called via supabase-py .rpc()).
-- ---------------------------------------------------------------------------

-- 6a) List stack_candidates.store_id values that don't match any canonical slug.
create or replace function public.snippd_agent_mismatched_store_ids()
returns table(raw_store_id text, row_count bigint)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    sc.store_id::text as raw_store_id,
    count(*)::bigint  as row_count
  from public.stack_candidates sc
  left join public.stores s on s.id = sc.store_id::text
  where s.id is null
  group by sc.store_id
  order by row_count desc;
$$;

-- 6b) Return the stack_candidates column list (for the Data_Auditor).
create or replace function public.snippd_agent_stack_candidates_columns()
returns table(column_name text, data_type text, is_nullable text, column_default text)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select c.column_name::text, c.data_type::text,
         c.is_nullable::text, c.column_default::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'stack_candidates'
  order by c.ordinal_position;
$$;

-- 6c) Upsert a retailer policy (atomic, returns the resulting row).
create or replace function public.snippd_agent_upsert_retailer_policy(
  p_store_id       text,
  p_policy_type    text,
  p_policy_key     text,
  p_value_json     jsonb,
  p_summary        text default null,
  p_source_url     text default null,
  p_source_snippet text default null,
  p_effective_date date default null,
  p_verified_by    text default 'Retailer_Policy_Curator',
  p_confidence     numeric default null
)
returns public.retailer_policies
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result public.retailer_policies;
begin
  insert into public.retailer_policies(
    store_id, policy_type, policy_key, value_json, summary,
    source_url, source_snippet, effective_date,
    verified_by, confidence, last_verified_at
  ) values (
    p_store_id, p_policy_type, p_policy_key, coalesce(p_value_json, '{}'::jsonb),
    p_summary, p_source_url, p_source_snippet, p_effective_date,
    coalesce(p_verified_by, 'Retailer_Policy_Curator'), p_confidence, now()
  )
  on conflict (store_id, policy_type, policy_key) do update set
    value_json       = excluded.value_json,
    summary          = coalesce(excluded.summary, public.retailer_policies.summary),
    source_url       = coalesce(excluded.source_url, public.retailer_policies.source_url),
    source_snippet   = coalesce(excluded.source_snippet, public.retailer_policies.source_snippet),
    effective_date   = coalesce(excluded.effective_date, public.retailer_policies.effective_date),
    verified_by      = excluded.verified_by,
    confidence       = coalesce(excluded.confidence, public.retailer_policies.confidence),
    last_verified_at = now(),
    is_active        = true
  returning * into result;
  return result;
end
$$;

-- 6d) Return policies older than N days (feeds the refresh scheduler).
create or replace function public.snippd_agent_stale_policies(p_days int default 30)
returns table(
  id uuid, store_id text, policy_type text, policy_key text,
  last_verified_at timestamptz, age_days int
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    rp.id, rp.store_id, rp.policy_type, rp.policy_key,
    rp.last_verified_at,
    extract(day from (now() - rp.last_verified_at))::int as age_days
  from public.retailer_policies rp
  where rp.is_active = true
    and rp.last_verified_at < now() - make_interval(days => greatest(p_days, 0))
  order by rp.last_verified_at asc;
$$;

-- ---------------------------------------------------------------------------
-- 7) RLS — read open to anon/authenticated, writes only via RPC / service role.
-- ---------------------------------------------------------------------------
alter table public.retailer_policies         enable row level security;
alter table public.retailer_policy_history   enable row level security;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'retailer_policies'
      and policyname = 'retailer_policies_read_all'
  ) then
    create policy retailer_policies_read_all
      on public.retailer_policies for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'retailer_policy_history'
      and policyname = 'retailer_policy_history_read_all'
  ) then
    create policy retailer_policy_history_read_all
      on public.retailer_policy_history for select using (true);
  end if;
end
$policies$;

grant select on public.retailer_policies            to anon, authenticated;
grant select on public.retailer_policy_history      to anon, authenticated;
grant select on public.v_retailer_policy_current    to anon, authenticated;
grant select on public.v_retailer_policy_staleness  to anon, authenticated;
grant execute on function public.snippd_agent_mismatched_store_ids()            to authenticated;
grant execute on function public.snippd_agent_stack_candidates_columns()        to authenticated;
grant execute on function public.snippd_agent_stale_policies(int)               to authenticated;
-- Write RPC stays restricted to service_role (used by the agent via the
-- SUPABASE_SERVICE_ROLE_KEY configured in the deployment).
grant execute on function public.snippd_agent_upsert_retailer_policy(
  text, text, text, jsonb, text, text, text, date, text, numeric
) to service_role;
