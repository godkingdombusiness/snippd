-- Add credit economy fields and user trip history
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS credits_balance INT DEFAULT 20,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_checkin TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.user_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer TEXT NOT NULL,
  total_pay NUMERIC(10,2) NOT NULL,
  total_saved NUMERIC(10,2) NOT NULL,
  items_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
