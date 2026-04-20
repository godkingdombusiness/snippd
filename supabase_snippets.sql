-- Snippd Concierge Prime — minimal Supabase objects referenced by the app.
-- Apply in the Supabase SQL editor or via migrations.

create table if not exists public.current_mission (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.current_mission enable row level security;

create policy "Users manage own mission"
  on public.current_mission
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- profiles.preferred_stores: text[] of store slugs (walmart, aldi, target)
-- If your profiles table lacks this column:
-- alter table public.profiles add column if not exists preferred_stores text[] default '{}';

-- Storage bucket for Studio UGC (create in dashboard or SQL):
-- insert into storage.buckets (id, name, public) values ('ugc-videos', 'ugc-videos', false);
