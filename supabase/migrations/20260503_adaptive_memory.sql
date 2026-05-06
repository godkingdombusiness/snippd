-- Adaptive memory layer for Snippd.
-- Supabase stays the system of record. Neo4j is optional adaptive memory.

create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  store_id text,
  product_id text,
  deal_id text,
  meal_id text,
  trip_id text,
  barcode text,
  cost numeric,
  savings numeric,
  nutrition_summary jsonb not null default '{}'::jsonb,
  allergy_flags jsonb not null default '{}'::jsonb,
  diet_flags jsonb not null default '{}'::jsonb,
  survey_response jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  neo4j_synced boolean not null default false,
  neo4j_synced_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_events_user_created
  on memory_events (user_id, created_at desc);

create index if not exists idx_memory_events_unsynced
  on memory_events (created_at)
  where neo4j_synced = false;

create index if not exists idx_memory_events_type
  on memory_events (event_type, created_at desc);

alter table memory_events enable row level security;

create policy "Users can read their own memory events"
  on memory_events
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage memory events"
  on memory_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists user_priority_profiles (
  user_id uuid primary key,
  savings_priority numeric not null default 0.5 check (savings_priority between 0 and 1),
  nutrition_priority numeric not null default 0.5 check (nutrition_priority between 0 and 1),
  convenience_priority numeric not null default 0.5 check (convenience_priority between 0 and 1),
  allergy_safety_priority numeric not null default 0.0 check (allergy_safety_priority between 0 and 1),
  store_loyalty_priority numeric not null default 0.5 check (store_loyalty_priority between 0 and 1),
  novelty_priority numeric not null default 0.3 check (novelty_priority between 0 and 1),
  budget_pressure numeric not null default 0.5 check (budget_pressure between 0 and 1),
  scan_compare_priority numeric not null default 0.3 check (scan_compare_priority between 0 and 1),
  store_accuracy_warning_priority numeric not null default 0.0 check (store_accuracy_warning_priority between 0 and 1),
  updated_at timestamptz not null default now()
);

alter table user_priority_profiles enable row level security;

create policy "Users can read their own priority profile"
  on user_priority_profiles
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage priority profiles"
  on user_priority_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function clamp_priority(value numeric)
returns numeric
language sql
immutable
as $$
  select least(1, greatest(0, coalesce(value, 0)))
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_priority_profiles_touch_updated_at on user_priority_profiles;
create trigger user_priority_profiles_touch_updated_at
before update on user_priority_profiles
for each row execute function touch_updated_at();
