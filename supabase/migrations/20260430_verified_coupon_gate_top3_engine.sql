-- Verified Coupon Gate + Top 3 Store Engine foundation.
-- User-facing coupons must come only from v_live_verified_digital_coupons.

create table if not exists public.retailer_coupon_sources (
  id uuid primary key default gen_random_uuid(),
  retailer_key text not null,
  store_region text,
  source_url text not null,
  source_type text not null default 'retailer_digital_coupon_page',
  is_active boolean default true,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  constraint retailer_coupon_sources_url_required
    check (source_url ~* '^https?://'),
  constraint retailer_coupon_sources_no_generic_homepage
    check (source_url !~* '^https?://(www\.)?[^/]+/?(\?.*)?$')
);

create table if not exists public.digital_coupon_evidence (
  id uuid primary key default gen_random_uuid(),
  retailer_key text not null,
  coupon_external_id text,
  exact_coupon_url text not null,
  source_page_url text not null,
  product_name text,
  brand text,
  normalized_key text,
  coupon_title text not null,
  coupon_value_text text,
  coupon_value_cents int,
  minimum_purchase_qty int,
  expiration_date date,
  valid_start_date date,
  region text,
  zip_code text,
  clipped_status text default 'unknown',
  raw_payload jsonb,
  evidence_hash text,
  screenshot_url text,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  verification_status text not null default 'verified',
  hidden_reason text,
  created_at timestamptz default now(),
  constraint digital_coupon_evidence_status_check
    check (verification_status in ('verified', 'unverified', 'hidden', 'expired', 'stale')),
  constraint digital_coupon_evidence_clipped_status_check
    check (clipped_status in ('clipped', 'not_clipped', 'unknown')),
  constraint digital_coupon_evidence_exact_url_required
    check (length(trim(exact_coupon_url)) > 0),
  constraint digital_coupon_evidence_source_url_required
    check (length(trim(source_page_url)) > 0),
  constraint digital_coupon_evidence_no_same_page_claim
    check (exact_coupon_url <> source_page_url),
  constraint digital_coupon_evidence_no_generic_exact_url
    check (exact_coupon_url !~* '^https?://(www\.)?[^/]+/?(\?.*)?$'),
  constraint digital_coupon_evidence_no_generic_source_url
    check (source_page_url !~* '^https?://(www\.)?[^/]+/?(\?.*)?$')
);

create table if not exists public.coupon_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_key text not null,
  region text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'running',
  coupons_found int default 0,
  coupons_verified int default 0,
  coupons_hidden int default 0,
  error_message text,
  constraint coupon_refresh_runs_status_check
    check (status in ('running', 'succeeded', 'failed', 'partial'))
);

create unique index if not exists digital_coupon_evidence_hash_uidx
  on public.digital_coupon_evidence (evidence_hash)
  where evidence_hash is not null;

create index if not exists digital_coupon_evidence_live_idx
  on public.digital_coupon_evidence (retailer_key, verification_status, verified_at, expiration_date);

create index if not exists digital_coupon_evidence_match_idx
  on public.digital_coupon_evidence (retailer_key, normalized_key, brand);

create index if not exists digital_coupon_evidence_expiration_idx
  on public.digital_coupon_evidence (expiration_date);

create index if not exists digital_coupon_evidence_verified_idx
  on public.digital_coupon_evidence (verified_at);

create index if not exists retailer_coupon_sources_active_idx
  on public.retailer_coupon_sources (retailer_key, is_active);

create or replace view public.v_live_verified_digital_coupons as
select *
from public.digital_coupon_evidence
where verification_status = 'verified'
  and exact_coupon_url is not null
  and exact_coupon_url <> ''
  and source_page_url is not null
  and source_page_url <> ''
  and exact_coupon_url <> source_page_url
  and exact_coupon_url !~* '^https?://(www\.)?[^/]+/?(\?.*)?$'
  and source_page_url !~* '^https?://(www\.)?[^/]+/?(\?.*)?$'
  and verified_at >= now() - interval '12 hours'
  and (expiration_date is null or expiration_date >= current_date)
  and (expires_at is null or expires_at > now());

create or replace view public.v_coupon_verified_stack_candidates as
select sc.*
from public.stack_candidates sc
where coalesce(sc.has_coupon, false) = false
   or exists (
     select 1
     from public.v_live_verified_digital_coupons c
     where lower(c.retailer_key) = lower(coalesce(sc.retailer_key, ''))
       and (
         c.normalized_key is null
         or c.normalized_key = sc.normalized_key
         or lower(coalesce(c.product_name, '') || ' ' || coalesce(c.brand, '') || ' ' || c.coupon_title)
            like '%' || replace(lower(coalesce(sc.normalized_key, sc.item_name, sc.primary_brand, sc.brand, '')), '-', '%') || '%'
       )
   );

create or replace function public.mark_stale_coupons_for_run(
  p_retailer_key text,
  p_region text,
  p_seen_hashes text[]
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.digital_coupon_evidence
  set verification_status = 'stale',
      hidden_reason = 'not_found_in_latest_refresh',
      expires_at = now()
  where retailer_key = p_retailer_key
    and (p_region is null or region = p_region)
    and verification_status = 'verified'
    and evidence_hash is not null
    and not (evidence_hash = any(coalesce(p_seen_hashes, array[]::text[])));
$$;

create or replace function public.get_verified_clippable_coupons(
  p_user_id uuid,
  p_normalized_keys text[]
)
returns table (
  coupon_id uuid,
  retailer_key text,
  product_name text,
  brand text,
  normalized_key text,
  discount_cents int,
  discount_pct numeric,
  coupon_type text,
  is_loyalty_req boolean,
  is_app_only boolean,
  expires_at timestamptz,
  expiration_date date,
  savings_label text,
  exact_coupon_url text,
  source_page_url text,
  coupon_title text,
  verified_at timestamptz,
  evidence_hash text,
  screenshot_url text,
  clipped_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as coupon_id,
    c.retailer_key,
    coalesce(c.product_name, c.coupon_title) as product_name,
    c.brand,
    c.normalized_key,
    coalesce(c.coupon_value_cents, 0) as discount_cents,
    null::numeric as discount_pct,
    'verified_digital'::text as coupon_type,
    true as is_loyalty_req,
    true as is_app_only,
    c.expires_at,
    c.expiration_date,
    coalesce(c.coupon_value_text, '$' || to_char(coalesce(c.coupon_value_cents, 0)::numeric / 100, 'FM999999990.00') || ' off') as savings_label,
    c.exact_coupon_url,
    c.source_page_url,
    c.coupon_title,
    c.verified_at,
    c.evidence_hash,
    c.screenshot_url,
    c.clipped_status
  from public.v_live_verified_digital_coupons c
  where
    c.normalized_key = any(p_normalized_keys)
    or lower(coalesce(c.product_name, '')) = any(p_normalized_keys)
    or lower(coalesce(c.brand, '')) = any(p_normalized_keys)
    or exists (
      select 1
      from unnest(p_normalized_keys) k
      where lower(coalesce(c.product_name, '') || ' ' || coalesce(c.brand, '') || ' ' || c.coupon_title)
        like '%' || replace(k, '-', '%') || '%'
    )
  order by coalesce(c.coupon_value_cents, 0) desc, c.verified_at desc;
$$;

create or replace function public.calculate_verified_digital_savings(
  p_user_id uuid,
  p_normalized_keys text[]
)
returns table (
  savings_cents int,
  matched_count int,
  verified_coupon_ids uuid[],
  exact_coupon_urls text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select distinct on (coupon_id) *
    from public.get_verified_clippable_coupons(p_user_id, p_normalized_keys)
    order by coupon_id, discount_cents desc
  )
  select
    coalesce(sum(discount_cents), 0)::int as savings_cents,
    count(*)::int as matched_count,
    coalesce(array_agg(coupon_id), array[]::uuid[]) as verified_coupon_ids,
    coalesce(array_agg(exact_coupon_url), array[]::text[]) as exact_coupon_urls
  from matches;
$$;

alter table public.retailer_coupon_sources enable row level security;
alter table public.digital_coupon_evidence enable row level security;
alter table public.coupon_refresh_runs enable row level security;

drop policy if exists "service manages retailer coupon sources" on public.retailer_coupon_sources;
create policy "service manages retailer coupon sources"
  on public.retailer_coupon_sources
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service manages coupon evidence" on public.digital_coupon_evidence;
create policy "service manages coupon evidence"
  on public.digital_coupon_evidence
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "authenticated reads only live coupon evidence" on public.digital_coupon_evidence;
create policy "authenticated reads only live coupon evidence"
  on public.digital_coupon_evidence
  for select
  to authenticated
  using (
    verification_status = 'verified'
    and exact_coupon_url is not null
    and exact_coupon_url <> ''
    and source_page_url is not null
    and source_page_url <> ''
    and exact_coupon_url <> source_page_url
    and verified_at >= now() - interval '12 hours'
    and (expiration_date is null or expiration_date >= current_date)
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "service manages coupon refresh runs" on public.coupon_refresh_runs;
create policy "service manages coupon refresh runs"
  on public.coupon_refresh_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.v_live_verified_digital_coupons to authenticated;
grant select on public.v_coupon_verified_stack_candidates to authenticated;
grant execute on function public.get_verified_clippable_coupons(uuid, text[]) to authenticated;
grant execute on function public.calculate_verified_digital_savings(uuid, text[]) to authenticated;

comment on table public.digital_coupon_evidence is
  'Verified-only digital coupon evidence. User-facing app must read v_live_verified_digital_coupons, never legacy digital_coupons.';

comment on table public.digital_coupons is
  'Legacy/internal coupon data. Do not expose user-facing coupons unless backed by digital_coupon_evidence and v_live_verified_digital_coupons.';
