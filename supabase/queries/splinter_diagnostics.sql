-- Splinter-style diagnostics (same logic as Supabase Database Advisors).
--
-- Why `lint."0001_..."` failed: the `lint` schema is not created on Postgres unless you
-- install Splinter views yourself. The dashboard still runs these checks; it does not
-- rely on those views existing in your database.
--
-- Source: https://github.com/supabase/splinter/tree/main/lints
--
-- Run ONE section at a time (highlight from the opening "with" or "select" through its
-- terminating semicolon). Running the whole file may only execute the first query.

-- =============================================================================
-- 0001_unindexed_foreign_keys
-- =============================================================================
with foreign_keys as (
  select
    cl.relnamespace::regnamespace::text as schema_name,
    cl.relname as table_name,
    cl.oid as table_oid,
    ct.conname as fkey_name,
    ct.conkey as col_attnums
  from pg_catalog.pg_constraint ct
  join pg_catalog.pg_class cl on ct.conrelid = cl.oid
  left join pg_catalog.pg_depend d on d.objid = cl.oid and d.deptype = 'e'
  where ct.contype = 'f'
    and d.objid is null
    and cl.relnamespace::regnamespace::text not in (
      'pg_catalog', 'information_schema', 'auth', 'storage', 'vault', 'extensions'
    )
),
index_ as (
  select
    pi.indrelid as table_oid,
    indexrelid::regclass as index_,
    string_to_array(indkey::text, ' ')::smallint[] as col_attnums
  from pg_catalog.pg_index pi
  where indisvalid
)
select
  fk.schema_name,
  fk.table_name,
  fk.fkey_name,
  fk.col_attnums as fkey_column_attnums,
  format(
    'Table `%s.%s` has foreign key `%s` without a covering index (Splinter 0001).',
    fk.schema_name,
    fk.table_name,
    fk.fkey_name
  ) as detail
from foreign_keys fk
left join index_ idx
  on fk.table_oid = idx.table_oid
  and fk.col_attnums = idx.col_attnums[1:array_length(fk.col_attnums, 1)]
left join pg_catalog.pg_depend dep
  on idx.table_oid = dep.objid
  and dep.deptype = 'e'
where idx.index_ is null
  and fk.schema_name not in (
    '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal',
    'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net',
    'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog',
    'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger',
    'topology', 'vault'
  )
  and dep.objid is null
order by fk.schema_name, fk.table_name, fk.fkey_name;

-- =============================================================================
-- 0004_no_primary_key
-- =============================================================================
select
  pgns.nspname as schema_name,
  pgc.relname as table_name,
  format(
    'Table `%s.%s` does not have a primary key (Splinter 0004).',
    pgns.nspname,
    pgc.relname
  ) as detail
from pg_catalog.pg_class pgc
join pg_catalog.pg_namespace pgns on pgns.oid = pgc.relnamespace
left join pg_catalog.pg_index pgi on pgi.indrelid = pgc.oid
left join pg_catalog.pg_depend dep on pgc.oid = dep.objid and dep.deptype = 'e'
where pgc.relkind = 'r'
  and pgns.nspname not in (
    '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal',
    'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net',
    'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog',
    'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger',
    'topology', 'vault'
  )
  and dep.objid is null
group by pgc.oid, pgns.nspname, pgc.relname
having max(coalesce(pgi.indisprimary, false)::int) = 0
order by 1, 2;

-- =============================================================================
-- 0005_unused_index  (idx_scan = 0)
--
-- IMPORTANT: Indexes you *just* created for FKs (e.g. idx_* from migrations) will
-- ALL show idx_scan = 0 until real queries use them. That is normal. Do NOT drop
-- these to "fix" the linter — you would remove the covering indexes Splinter 0001
-- asked for. After production traffic, many of these counts should rise; some may
-- stay 0 if the planner rarely chooses that index (FKs still help deletes/updates
-- on referenced rows in some cases).
-- =============================================================================
select
  psui.schemaname as schema_name,
  psui.relname as table_name,
  psui.indexrelname as index_name,
  psui.idx_scan,
  format(
    'Index `%s` on `%s.%s` has not been used (Splinter 0005).',
    psui.indexrelname,
    psui.schemaname,
    psui.relname
  ) as detail
from pg_catalog.pg_stat_user_indexes psui
join pg_catalog.pg_index pi on psui.indexrelid = pi.indexrelid
left join pg_catalog.pg_depend dep on psui.relid = dep.objid and dep.deptype = 'e'
where psui.idx_scan = 0
  and not pi.indisunique
  and not pi.indisprimary
  and dep.objid is null
  and psui.schemaname not in (
    '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal',
    'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net',
    'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog',
    'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger',
    'topology', 'vault'
  )
order by psui.schemaname, psui.relname, psui.indexrelname;
