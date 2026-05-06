-- user_trips: tracks planned shopping missions locked from WeeklyPlanScreen
-- Written by: Snippd Concierge Loop v2.0.0

CREATE TABLE IF NOT EXISTS user_trips (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_week_start       date        NOT NULL,
    total_estimated_cents integer     NOT NULL DEFAULT 0,
    total_savings_cents   integer     NOT NULL DEFAULT 0,
    store_preference      text        NOT NULL DEFAULT 'one_stop',
    primary_store         text,
    item_count            integer     NOT NULL DEFAULT 0,
    status                text        NOT NULL DEFAULT 'planned',  -- planned | shopping | verified
    clipped_at            timestamptz,
    verified_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_trips_preference_valid CHECK (store_preference IN ('one_stop', 'multi_store')),
    CONSTRAINT user_trips_status_valid     CHECK (status IN ('planned', 'shopping', 'verified'))
);

-- Enforce one active trip per user per week
CREATE UNIQUE INDEX IF NOT EXISTS user_trips_user_week_idx
    ON user_trips (user_id, plan_week_start);

-- RLS
ALTER TABLE user_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_trips_select" ON user_trips;
CREATE POLICY "user_trips_select" ON user_trips
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trips_insert" ON user_trips;
CREATE POLICY "user_trips_insert" ON user_trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trips_update" ON user_trips;
CREATE POLICY "user_trips_update" ON user_trips
    FOR UPDATE USING (auth.uid() = user_id);
