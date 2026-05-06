-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_user_preferences
-- Adds user_preferences table for behavior-driven personalization.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_range     INT         NOT NULL DEFAULT 150,
  preferred_stores TEXT[]      NOT NULL DEFAULT '{}',
  category_clicks  JSONB       NOT NULL DEFAULT '{}',
  last_actions     JSONB       NOT NULL DEFAULT '{}',
  experience_type  TEXT        NOT NULL DEFAULT 'saver'
                               CHECK (experience_type IN ('saver', 'convenience', 'explorer')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row-level security: users can only read/write their own row
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences_select_own"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_preferences_upsert_own"
  ON user_preferences FOR ALL
  USING (auth.uid() = user_id);

-- Fast lookup for the primary key is automatic, but add index on experience_type
-- for potential server-side analytics queries.
CREATE INDEX IF NOT EXISTS idx_user_preferences_experience
  ON user_preferences (experience_type);

-- Verify
SELECT COUNT(*) AS total_rows FROM user_preferences;
