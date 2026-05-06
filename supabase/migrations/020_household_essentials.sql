-- Migration 020: household_essentials table
-- Stores canonical household staples used by get-weekly-plan household_stack section

CREATE TABLE IF NOT EXISTS public.household_essentials (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name         text NOT NULL,
  category               text NOT NULL,
  emoji                  text NOT NULL DEFAULT '🛒',
  avg_price_cents        integer NOT NULL DEFAULT 999,
  restock_frequency_days integer NOT NULL DEFAULT 14,
  is_default             boolean NOT NULL DEFAULT true,
  sort_order             integer NOT NULL DEFAULT 99,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Index for default item queries
CREATE INDEX IF NOT EXISTS idx_household_essentials_default
  ON public.household_essentials (is_default, sort_order);

-- Enable RLS
ALTER TABLE public.household_essentials ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users
CREATE POLICY "household_essentials_read"
  ON public.household_essentials
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed 10 default household essentials
INSERT INTO public.household_essentials
  (canonical_name, category, emoji, avg_price_cents, restock_frequency_days, is_default, sort_order)
VALUES
  ('Paper towels',      'paper',         '🧻', 899,  14, true, 1),
  ('Toilet paper',      'paper',         '🧻', 999,  14, true, 2),
  ('Dish soap',         'cleaning',      '🧼', 399,  21, true, 3),
  ('Trash bags',        'cleaning',      '🗑️', 799,  30, true, 4),
  ('Laundry detergent', 'laundry',       '🧺', 1199, 30, true, 5),
  ('Body wash',         'personal_care', '🚿', 499,  21, true, 6),
  ('Toothpaste',        'personal_care', '🦷', 499,  30, true, 7),
  ('Shampoo',           'personal_care', '🧴', 599,  30, true, 8),
  ('Hand soap',         'cleaning',      '🫧', 349,  21, true, 9),
  ('Sponges',           'cleaning',      '🧽', 299,  14, true, 10)
ON CONFLICT DO NOTHING;
