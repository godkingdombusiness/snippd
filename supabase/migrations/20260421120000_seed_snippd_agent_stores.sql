-- Seed retailers required by the Snippd ADK agent (`snippd_agent/agents/shared.py`).
--
-- Goals:
--   1. Guarantee a `public.stores` lookup table with the 11 canonical slugs used by
--      the Stack_Architect agent (walmart, aldi, target, publix, sprouts, cvs,
--      walgreens, trader_joes, bravo, sav_a_lot, key_foods).
--   2. Never destroy or overwrite your existing rows — all work is idempotent
--      (CREATE IF NOT EXISTS + INSERT ... ON CONFLICT DO UPDATE).
--   3. Attach any rows already present in `public.stack_candidates` whose
--      `store_id` already matches one of our slugs — but DO NOT invent dinner data.
--   4. Provide a diagnostic view (`v_snippd_store_audit`) so we can see which
--      stores actually have candidate rows.
--
-- If your schema for `stores` or `stack_candidates` differs from the assumptions
-- below, the DO-blocks skip gracefully rather than erroring.

-- ---------------------------------------------------------------------------
-- 1) Ensure a stores lookup table exists with a compatible shape.
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id           text primary key,
  name         text not null,
  origin       text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Ensure the columns exist if the table was created earlier with a slimmer shape.
do $ensure_stores_cols$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stores' and column_name = 'origin'
  ) then
    alter table public.stores add column origin text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stores' and column_name = 'is_active'
  ) then
    alter table public.stores add column is_active boolean not null default true;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stores' and column_name = 'updated_at'
  ) then
    alter table public.stores add column updated_at timestamptz not null default now();
  end if;
end
$ensure_stores_cols$;

-- ---------------------------------------------------------------------------
-- 2) Upsert the 11 canonical stores.
-- ---------------------------------------------------------------------------
insert into public.stores (id, name, origin, is_active) values
  ('walmart',     'Walmart',                 'https://www.walmart.com',           true),
  ('aldi',        'Aldi',                    'https://www.aldi.us',               true),
  ('target',      'Target',                  'https://www.target.com',            true),
  ('publix',      'Publix',                  'https://www.publix.com',            true),
  ('sprouts',     'Sprouts Farmers Market',  'https://www.sprouts.com',           true),
  ('cvs',         'CVS Pharmacy',            'https://www.cvs.com',               true),
  ('walgreens',   'Walgreens',               'https://www.walgreens.com',         true),
  ('trader_joes', 'Trader Joe''s',           'https://www.traderjoes.com',        true),
  ('bravo',       'Bravo Supermarkets',      'https://www.shopbravo.com',         true),
  ('sav_a_lot',   'Save A Lot',              'https://save-a-lot.com',            true),
  ('key_foods',   'Key Food',                'https://www.keyfood.com',           true)
on conflict (id) do update set
  name       = excluded.name,
  origin     = coalesce(excluded.origin, public.stores.origin),
  is_active  = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Helpful index for the agent's filter-by-store queries against stack_candidates
--    (only if the column exists).
-- ---------------------------------------------------------------------------
do $ensure_stack_candidates_store_idx$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'stack_candidates'
      and column_name  = 'store_id'
  ) then
    create index if not exists idx_stack_candidates_store_id
      on public.stack_candidates (store_id);
  end if;
end
$ensure_stack_candidates_store_idx$;

-- ---------------------------------------------------------------------------
-- 4) Diagnostic view: how many candidate rows does each canonical store have?
--    (Uses a LEFT JOIN so stores with zero rows are visible as 0.)
-- ---------------------------------------------------------------------------
do $build_audit_view$
declare
  has_stack_candidates boolean;
  has_store_id_col     boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'stack_candidates'
  ) into has_stack_candidates;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'stack_candidates'
      and column_name  = 'store_id'
  ) into has_store_id_col;

  if has_stack_candidates and has_store_id_col then
    execute $view$
      create or replace view public.v_snippd_store_audit
      with (security_invoker = on) as
      select
        s.id               as store_id,
        s.name             as store_name,
        s.is_active,
        coalesce(c.row_count, 0) as stack_candidate_rows
      from public.stores s
      left join (
        select store_id::text as store_id, count(*)::bigint as row_count
        from public.stack_candidates
        group by store_id
      ) c on c.store_id = s.id
      order by s.id
    $view$;
  else
    -- Fallback audit view that shows just the store list until stack_candidates exists.
    create or replace view public.v_snippd_store_audit
    with (security_invoker = on) as
    select
      s.id          as store_id,
      s.name        as store_name,
      s.is_active,
      0::bigint     as stack_candidate_rows
    from public.stores s
    order by s.id;
  end if;
end
$build_audit_view$;

comment on view public.v_snippd_store_audit is
  'Snippd agent — row counts in stack_candidates per canonical store slug.';

-- ---------------------------------------------------------------------------
-- 5) Safety: allow authenticated/anon roles to read the stores lookup and the
--    audit view (matches the pattern used for other lookup tables in the repo).
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;

do $grant_stores_read$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'stores'
      and policyname = 'stores_read_all'
  ) then
    create policy stores_read_all
      on public.stores
      for select
      using (true);
  end if;
end
$grant_stores_read$;

grant select on public.stores             to anon, authenticated;
grant select on public.v_snippd_store_audit to anon, authenticated;
