-- Snippd "Early Warning System": emit a Slack message whenever a retailer
-- policy is inserted, drift-updated, or deleted.
--
-- How it works
--   1. Integration config is stored in `public.snippd_integrations`
--      (service_role only) — one row per channel, e.g.:
--         INSERT INTO public.snippd_integrations (name, config) VALUES (
--           'slack_policy_changes',
--           '{"webhook_url":"https://hooks.slack.com/services/XXX/YYY/ZZZ"}'::jsonb
--         );
--   2. The AFTER INSERT trigger on `retailer_policy_history` reads that row,
--      builds a Slack Block Kit payload, and POSTs via `pg_net`.
--   3. Failures are logged as warnings so policy writes never get blocked.
--
-- Requirements: pg_net extension enabled in the project (Database → Extensions
-- → search "pg_net" → enable). The migration attempts to enable it; if the
-- project role lacks CREATE EXTENSION privilege, enable it in the UI first.

-- ---------------------------------------------------------------------------
-- 0) Dependencies.
-- ---------------------------------------------------------------------------
do $ensure_pg_net$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not auto-enabled (%). Enable it in the Supabase dashboard '
                 'under Database → Extensions, then re-run this migration.', sqlerrm;
  end;
end
$ensure_pg_net$;

-- ---------------------------------------------------------------------------
-- 1) Integrations table (webhook URLs, API tokens, etc.).
--    Locked down: RLS on, no permissive policies — only service_role reads.
-- ---------------------------------------------------------------------------
create table if not exists public.snippd_integrations (
  name        text primary key,
  config      jsonb not null default '{}'::jsonb,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.snippd_integrations enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated → only
-- service_role (which bypasses RLS) can touch this table. Intentional.

comment on table public.snippd_integrations is
  'Snippd external integrations config (Slack webhook URL, etc.). service_role access only.';

-- ---------------------------------------------------------------------------
-- 2) Trigger function: build Slack payload and POST.
--    SECURITY DEFINER so the trigger can read snippd_integrations even when
--    the calling role (the Retailer_Policy_Curator running as service_role)
--    triggers on policy writes. pg_net calls are async — they enqueue and
--    return immediately, so triggers stay fast.
-- ---------------------------------------------------------------------------
create or replace function public.notify_retailer_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $notify$
declare
  cfg              jsonb;
  webhook          text;
  current_state    jsonb;
  old_value        jsonb;
  new_value        jsonb;
  header_emoji     text;
  header_line      text;
  detail_lines     text;
  payload          jsonb;
begin
  -- Look up Slack config; silently exit if the integration row is missing
  -- or disabled (we don't want to block policy writes).
  select config into cfg
  from public.snippd_integrations
  where name = 'slack_policy_changes'
    and is_enabled = true
  limit 1;

  if cfg is null then
    return new;
  end if;

  webhook := cfg->>'webhook_url';
  if webhook is null or webhook = '' then
    return new;
  end if;

  -- Pull the current live row for diff context on updates.
  if new.change_kind in ('hash_change', 'update') then
    select row_to_json(rp.*)::jsonb into current_state
    from public.retailer_policies rp
    where rp.id = new.policy_id;
    old_value := new.value_json;
    new_value := coalesce(current_state->'value_json', '{}'::jsonb);
  elsif new.change_kind = 'insert' then
    old_value := null;
    new_value := new.value_json;
  else  -- 'delete'
    old_value := new.value_json;
    new_value := null;
  end if;

  header_emoji := case new.change_kind
    when 'insert'      then ':sparkles:'
    when 'hash_change' then ':warning:'
    when 'delete'      then ':skull:'
    else ':rotating_light:'
  end;

  header_line := format(
    '%s *Retailer policy %s* — `%s` / `%s.%s`',
    header_emoji, new.change_kind, new.store_id, new.policy_type, new.policy_key
  );

  detail_lines := format(
    '*Source:* %s%s*Verified by:* `%s`%s*When (UTC):* %s%s*Confidence:* %s',
    coalesce(new.source_url, '_none_'), E'\n',
    coalesce(new.verified_by, '_system_'), E'\n',
    to_char(new.changed_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'), E'\n',
    coalesce(new.confidence::text, '_n/a_')
  );

  payload := jsonb_build_object(
    'text', header_line,
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object('type','mrkdwn','text', header_line)
      ),
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object('type','mrkdwn','text', detail_lines)
      ),
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object(
          'type','mrkdwn',
          'text', format('*Old value:*```%s```', coalesce(old_value::text, 'null'))
        )
      ),
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object(
          'type','mrkdwn',
          'text', format('*New value:*```%s```', coalesce(new_value::text, 'null'))
        )
      ),
      jsonb_build_object(
        'type', 'context',
        'elements', jsonb_build_array(
          jsonb_build_object('type','mrkdwn','text',
            format('policy_id `%s` • history `#%s`', new.policy_id, new.id))
        )
      )
    )
  );

  -- pg_net is async — this enqueues the HTTP call and returns immediately.
  -- Swallow errors so a failing webhook never breaks policy writes.
  begin
    perform net.http_post(
      url     := webhook,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := payload
    );
  exception when others then
    raise warning 'Slack notifier failed for policy %/%.%: %',
      new.store_id, new.policy_type, new.policy_key, sqlerrm;
  end;

  return new;
end
$notify$;

-- ---------------------------------------------------------------------------
-- 3) Attach trigger to history table.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_retailer_policy_history_slack on public.retailer_policy_history;
create trigger trg_retailer_policy_history_slack
  after insert on public.retailer_policy_history
  for each row execute function public.notify_retailer_policy_change();

comment on trigger trg_retailer_policy_history_slack on public.retailer_policy_history is
  'Fires a Slack webhook on every retailer policy change (via pg_net).';
