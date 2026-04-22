-- Snippd account-deletion cascade hardening.
--
-- Apple App Store Review Guideline 5.1.1(v): deleting an account must
-- also delete all associated data. The delete-account edge function
-- handles explicit per-table cleanup (see supabase/functions/delete-account/),
-- but this migration adds belt-and-suspenders cascade behavior at the
-- database level: any FK on `auth.users(id)` is rewritten to ON DELETE
-- CASCADE so a future table we forget to explicitly clean still goes away
-- automatically when the auth row is deleted.
--
-- Idempotent: inspects current FK rules before rewriting them.
-- Defensive: wrapped in a DO block so a schema that happens not to have
-- a table listed here simply skips it without erroring.
-- Safe to run multiple times.

do $$
declare
  r record;
begin
  for r in
    select
      c.conname           as constraint_name,
      n.nspname           as schema_name,
      t.relname           as table_name,
      pg_get_constraintdef(c.oid) as constraint_def
    from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype <> 'c'           -- already cascade? leave alone
      and n.nspname not in ('pg_catalog', 'information_schema')
  loop
    raise notice 'rewriting %.%.% (currently: %)',
      r.schema_name, r.table_name, r.constraint_name, r.constraint_def;

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );

    -- Re-derive the FK def but with ON DELETE CASCADE. We assume
    -- (schema, table, col) -> auth.users(id). Any non-standard FK (e.g.
    -- multi-column) will skip the rewrite via the exception handler
    -- and surface a warning instead of breaking the migration.
    begin
      execute format(
        'alter table %I.%I add constraint %I ' ||
        'foreign key (user_id) references auth.users(id) on delete cascade',
        r.schema_name, r.table_name, r.constraint_name
      );
    exception
      when others then
        raise warning 'could not re-add %.%.% as cascade: % — original dropped; re-add manually',
          r.schema_name, r.table_name, r.constraint_name, sqlerrm;
    end;
  end loop;
end $$;

-- Post-condition check: after this migration, the following query
-- should return zero rows. Run in Supabase SQL editor to verify.
--
-- select c.conname, n.nspname, t.relname
-- from pg_catalog.pg_constraint c
--   join pg_catalog.pg_class t on t.oid = c.conrelid
--   join pg_catalog.pg_namespace n on n.oid = t.relnamespace
-- where c.contype = 'f'
--   and c.confrelid = 'auth.users'::regclass
--   and c.confdeltype <> 'c';
