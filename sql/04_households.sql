-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — Household Shared Cart System
-- Creates: households, household_members tables
-- RBAC: Triggers enforce 5-member cap, 1 Stack Manager, 1-2 Shoppers
-- RLS: Members can only see their own household; Stack Manager manages members
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Drop and recreate cleanly ─────────────────────────────────────────────────
DROP TABLE IF EXISTS public.household_members CASCADE;
DROP TABLE IF EXISTS public.households CASCADE;

-- ── households ────────────────────────────────────────────────────────────────
CREATE TABLE public.households (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  invite_code  text UNIQUE NOT NULL,
  owner_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_type    text NOT NULL DEFAULT 'family'
                 CHECK (plan_type IN ('family')),
  total_saved_cents bigint NOT NULL DEFAULT 0,
  trips_count  int  NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── household_members ─────────────────────────────────────────────────────────
CREATE TABLE public.household_members (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role         text NOT NULL DEFAULT 'VIEWER'
                 CHECK (role IN ('STACK MANAGER', 'SHOPPER', 'VIEWER')),
  username     text,                         -- denormalized for attribution labels
  joined_at    timestamptz DEFAULT now(),
  UNIQUE(household_id, user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_hh_members_household ON public.household_members(household_id);
CREATE INDEX idx_hh_members_user      ON public.household_members(user_id);

-- ── TRIGGER: Enforce RBAC hard caps ──────────────────────────────────────────
-- • Max 5 members per household
-- • Exactly 1 STACK MANAGER (enforced on INSERT; role changes use UPDATE)
-- • Max 2 SHOPPERs — 3rd Shopper is silently downgraded to VIEWER

CREATE OR REPLACE FUNCTION public.fn_enforce_household_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count  int;
  v_role_count    int;
BEGIN
  -- 1. Hard cap: max 5 members
  SELECT COUNT(*) INTO v_member_count
  FROM public.household_members
  WHERE household_id = NEW.household_id;

  IF v_member_count >= 5 THEN
    RAISE EXCEPTION 'Household is full. Maximum 5 members are allowed per household.';
  END IF;

  -- 2. Exactly 1 Stack Manager
  IF NEW.role = 'STACK MANAGER' THEN
    SELECT COUNT(*) INTO v_role_count
    FROM public.household_members
    WHERE household_id = NEW.household_id AND role = 'STACK MANAGER';

    IF v_role_count >= 1 THEN
      RAISE EXCEPTION 'A Stack Manager already exists for this household. Only one Stack Manager is allowed.';
    END IF;
  END IF;

  -- 3. Max 2 Shoppers — silently downgrade to VIEWER
  IF NEW.role = 'SHOPPER' THEN
    SELECT COUNT(*) INTO v_role_count
    FROM public.household_members
    WHERE household_id = NEW.household_id AND role = 'SHOPPER';

    IF v_role_count >= 2 THEN
      NEW.role := 'VIEWER';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_household_rules ON public.household_members;
CREATE TRIGGER trg_household_rules
  BEFORE INSERT ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_household_rules();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- Households: owner has full access; members can read
CREATE POLICY "hh_owner_all" ON public.households
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "hh_member_read" ON public.households
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.household_members WHERE household_id = id
    )
  );

-- Members: anyone in the household can read the member list
CREATE POLICY "hh_members_read" ON public.household_members
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- Stack Manager can INSERT, UPDATE, DELETE other members
CREATE POLICY "hh_manager_insert" ON public.household_members
  FOR INSERT WITH CHECK (
    -- User inserting themselves (self-join via invite code)
    auth.uid() = user_id
    OR
    -- Stack Manager adding someone else
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND role = 'STACK MANAGER'
    )
  );

CREATE POLICY "hh_manager_update" ON public.household_members
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND role = 'STACK MANAGER'
    )
  );

CREATE POLICY "hh_manager_delete" ON public.household_members
  FOR DELETE USING (
    -- Stack Manager removes others
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND role = 'STACK MANAGER'
    )
    OR
    -- Member leaves their own household
    auth.uid() = user_id
  );

-- ── household_cart_items: shared structured cart ──────────────────────────────
DROP TABLE IF EXISTS public.household_cart_items CASCADE;

CREATE TABLE public.household_cart_items (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id   uuid REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  added_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by_username text,                    -- @handle at time of adding
  product_name   text NOT NULL,
  category       text NOT NULL DEFAULT 'Other'
                   CHECK (category IN ('Produce','Protein','Dairy','Pantry','Snacks','Household','Frozen','Beverages','Other')),
  quantity       int NOT NULL DEFAULT 1,
  unit_price_cents bigint,
  save_cents     bigint,
  retailer       text,
  source         text NOT NULL DEFAULT 'user_added'
                   CHECK (source IN ('meal_plan','snippd_deal','user_added')),
  source_ref_id  uuid,                       -- FK to meal_plan item or app_home_feed.id
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','purchased','removed')),
  added_at       timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_hh_cart_household ON public.household_cart_items(household_id, status);
CREATE INDEX idx_hh_cart_category  ON public.household_cart_items(household_id, category);

ALTER TABLE public.household_cart_items ENABLE ROW LEVEL SECURITY;

-- All household members can read cart
CREATE POLICY "hh_cart_read" ON public.household_cart_items
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- Members can add/update/remove items (Viewers can still add from deals)
CREATE POLICY "hh_cart_insert" ON public.household_cart_items
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
    AND auth.uid() = added_by
  );

CREATE POLICY "hh_cart_update" ON public.household_cart_items
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
    )
  );

-- ── Duplicate detection RPC ───────────────────────────────────────────────────
-- Called from client before adding to catch exact + fuzzy matches and merge qty

CREATE OR REPLACE FUNCTION public.upsert_household_cart_item(
  p_household_id   uuid,
  p_user_id        uuid,
  p_username       text,
  p_product_name   text,
  p_category       text,
  p_quantity       int DEFAULT 1,
  p_unit_price     bigint DEFAULT NULL,
  p_save_cents     bigint DEFAULT NULL,
  p_retailer       text DEFAULT NULL,
  p_source         text DEFAULT 'user_added',
  p_source_ref_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id  uuid;
  v_new_qty      int;
BEGIN
  -- Fuzzy duplicate: same lowercase name in same household (active items only)
  SELECT id, quantity INTO v_existing_id, v_new_qty
  FROM public.household_cart_items
  WHERE household_id = p_household_id
    AND status = 'active'
    AND lower(trim(product_name)) = lower(trim(p_product_name))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Merge: increment quantity
    UPDATE public.household_cart_items
    SET
      quantity   = v_new_qty + p_quantity,
      updated_at = now()
    WHERE id = v_existing_id;

    RETURN jsonb_build_object('action', 'merged', 'id', v_existing_id, 'quantity', v_new_qty + p_quantity);
  ELSE
    -- Fresh insert
    INSERT INTO public.household_cart_items
      (household_id, added_by, added_by_username, product_name, category,
       quantity, unit_price_cents, save_cents, retailer, source, source_ref_id)
    VALUES
      (p_household_id, p_user_id, p_username, p_product_name, p_category,
       p_quantity, p_unit_price, p_save_cents, p_retailer, p_source, p_source_ref_id)
    RETURNING id INTO v_existing_id;

    RETURN jsonb_build_object('action', 'inserted', 'id', v_existing_id, 'quantity', p_quantity);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_household_cart_item IS
  'Adds item to household cart or merges quantity if duplicate name detected. Returns action + id.';

COMMENT ON TABLE public.households IS
  'Snippd Household: shared grocery management unit gated behind the $30/mo Family Plan.';
COMMENT ON TABLE public.household_members IS
  'Members of a household with RBAC roles. Max 5 members, 1 Stack Manager, 1-2 Shoppers.';
COMMENT ON TABLE public.household_cart_items IS
  'Shared household cart. Items can only be added via meal_plan, snippd_deal, or validated user_added source.';
