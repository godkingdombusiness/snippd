-- Atomic lock haul transaction: deduct credits and save the haul in one transaction.
CREATE OR REPLACE FUNCTION public.lock_haul_transaction(
  p_user_id UUID,
  p_retailer TEXT,
  p_total_pay NUMERIC,
  p_total_saved NUMERIC,
  p_items_json JSONB,
  p_credit_cost INT DEFAULT 3
)
RETURNS TABLE(trip_id UUID, remaining_credits INT)
LANGUAGE plpgsql AS $$
DECLARE
  current_credits INT;
BEGIN
  SELECT credits_balance
  INTO current_credits
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user_id %', p_user_id;
  END IF;

  IF current_credits < p_credit_cost THEN
    RAISE EXCEPTION 'Insufficient credits to lock haul';
  END IF;

  UPDATE public.profiles
  SET credits_balance = current_credits - p_credit_cost
  WHERE user_id = p_user_id;

  INSERT INTO public.user_trips(
    user_id,
    retailer,
    total_pay,
    total_saved,
    items_json,
    status
  ) VALUES (
    p_user_id,
    p_retailer,
    p_total_pay,
    p_total_saved,
    p_items_json,
    'active'
  ) RETURNING id INTO trip_id;

  remaining_credits := current_credits - p_credit_cost;
  RETURN NEXT;
END;
$$;
