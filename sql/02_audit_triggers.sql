-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — Audit Trail (Postgres Triggers → system_audit_logs)
-- Safe to re-run: drops and recreates the audit table from scratch.
-- (No production data exists in this table yet — it's new.)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Drop previous partial table (if any) ─────────────────────────────────────
-- This clears any incomplete table left from a failed previous run.
DROP TABLE IF EXISTS public.system_audit_logs CASCADE;


-- ── Create audit log table ────────────────────────────────────────────────────
CREATE TABLE public.system_audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  table_name  text        NOT NULL,
  row_id      uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_time
  ON public.system_audit_logs (user_id, created_at DESC);

CREATE INDEX idx_audit_table_event
  ON public.system_audit_logs (table_name, event_type);


-- ── Trigger function ──────────────────────────────────────────────────────────
-- SECURITY DEFINER lets the trigger write to system_audit_logs even though
-- authenticated users have no INSERT policy on that table.
CREATE OR REPLACE FUNCTION public.fn_audit_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id uuid;
BEGIN
  -- Safely extract the primary key of the affected row
  IF TG_OP = 'DELETE' THEN
    v_row_id := OLD.id;
  ELSE
    v_row_id := NEW.id;
  END IF;

  INSERT INTO public.system_audit_logs
    (user_id, event_type, table_name, row_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_row_id,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


-- ── Trigger on profiles ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_log_changes();


-- ── Trigger on approved_cart ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_approved_cart ON public.approved_cart;
CREATE TRIGGER trg_audit_approved_cart
  AFTER INSERT OR UPDATE OR DELETE ON public.approved_cart
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_log_changes();


-- ── RLS: deny all direct client access ───────────────────────────────────────
-- The SECURITY DEFINER trigger writes to this table. No client can read or
-- write it directly.
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_no_client_access" ON public.system_audit_logs;
CREATE POLICY "audit_no_client_access"
  ON public.system_audit_logs FOR ALL
  TO authenticated, anon
  USING (false);


-- ── Verify (run this separately after deploying) ──────────────────────────────
-- SELECT trigger_name, event_manipulation, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public'
-- ORDER BY event_object_table, trigger_name;
