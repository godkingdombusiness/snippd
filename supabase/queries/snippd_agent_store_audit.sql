-- Read-only diagnostics for the Snippd ADK agent.
-- Run these in Supabase Studio → SQL Editor AFTER applying
-- 20260421120000_seed_snippd_agent_stores.sql.

-- 1) Confirm the 11 canonical stores are seeded and active.
select id, name, origin, is_active
from public.stores
order by id;

-- 2) See row counts in stack_candidates per canonical store.
--    Stores with 0 rows will come back from the agent with empty strategies.
select * from public.v_snippd_store_audit;

-- 3) See which store_id values currently exist in stack_candidates but DON'T
--    match any canonical slug (so we can normalize them).
select
  sc.store_id                as raw_store_id,
  count(*)::bigint           as row_count
from public.stack_candidates sc
left join public.stores s on s.id = sc.store_id::text
where s.id is null
group by sc.store_id
order by row_count desc;

-- 4) Full column list for stack_candidates (needed if we want to seed demo rows).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'stack_candidates'
order by ordinal_position;
