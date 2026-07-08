-- Plan 7.2: Wöchentliches automatisches Backup aller Haushaltsdaten als
-- JSON-Snapshot in die Tabelle public.backups (RLS-geschützt, 8 Sicherungen
-- Aufbewahrung pro Haushalt). Zeitplan via pg_cron (Mo 03:00 UTC); zusätzlich
-- kann jeder Nutzer über create_household_backup() manuell sichern.
-- IBAN wird bewusst NICHT gesichert (Spaltenschutz bliebe sonst wirkungslos,
-- da Backups für alle Haushaltsmitglieder lesbar sind).

CREATE TABLE IF NOT EXISTS public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  size_bytes integer NOT NULL DEFAULT 0,
  note text NULL,
  payload jsonb NOT NULL
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view backups of their household" ON public.backups;
CREATE POLICY "Users can view backups of their household"
  ON public.backups FOR SELECT
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can delete backups of their household" ON public.backups;
CREATE POLICY "Users can delete backups of their household"
  ON public.backups FOR DELETE
  USING (household_id = get_user_household_id());
-- Kein INSERT/UPDATE für Clients — Snapshots entstehen nur über die Funktionen.

-- Interner Snapshot-Builder (nicht für Clients aufrufbar)
CREATE OR REPLACE FUNCTION public._backup_household(p_household_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_id uuid;
BEGIN
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'created_at', now(),
    'household', (SELECT to_jsonb(h) FROM public.households h WHERE h.id = p_household_id),
    'profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'iban'), '[]'::jsonb) FROM public.profiles t WHERE t.household_id = p_household_id),
    'contractors', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.contractors t WHERE t.household_id = p_household_id),
    'invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.invoices t WHERE t.household_id = p_household_id),
    'invoice_payments', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.invoice_payments t WHERE t.invoice_id IN (SELECT id FROM public.invoices WHERE household_id = p_household_id)),
    'invoice_splits', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.invoice_splits t WHERE t.invoice_id IN (SELECT id FROM public.invoices WHERE household_id = p_household_id)),
    'invoice_allocations', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.invoice_allocations t WHERE t.invoice_id IN (SELECT id FROM public.invoices WHERE household_id = p_household_id)),
    'invoice_deductions', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.invoice_deductions t WHERE t.invoice_id IN (SELECT id FROM public.invoices WHERE household_id = p_household_id)),
    'documents', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.documents t WHERE t.household_id = p_household_id),
    'offers', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.offers t WHERE t.household_id = p_household_id),
    'offer_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.offer_items t WHERE t.offer_id IN (SELECT id FROM public.offers WHERE household_id = p_household_id)),
    'architect_estimates', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.architect_estimates t WHERE t.household_id = p_household_id),
    'architect_estimate_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.architect_estimate_items t WHERE t.estimate_id IN (SELECT id FROM public.architect_estimates WHERE household_id = p_household_id)),
    'estimate_versions', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.estimate_versions t WHERE t.household_id = p_household_id),
    'estimate_blocks', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.estimate_blocks t WHERE t.version_id IN (SELECT id FROM public.estimate_versions WHERE household_id = p_household_id)),
    'construction_journal', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.construction_journal t WHERE t.household_id = p_household_id)
  );

  INSERT INTO public.backups (household_id, payload, size_bytes)
  VALUES (p_household_id, v_payload, pg_column_size(v_payload))
  RETURNING id INTO v_id;

  -- Aufbewahrung: die neuesten 8 Sicherungen behalten
  DELETE FROM public.backups b
  WHERE b.household_id = p_household_id
    AND b.id NOT IN (
      SELECT id FROM public.backups
      WHERE household_id = p_household_id
      ORDER BY created_at DESC
      LIMIT 8
    );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._backup_household(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._backup_household(uuid) TO service_role;

-- Manuelles Backup durch ein Haushaltsmitglied ("Jetzt sichern")
CREATE OR REPLACE FUNCTION public.create_household_backup()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household uuid;
BEGIN
  v_household := public.get_user_household_id();
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'Kein Haushalt gefunden';
  END IF;
  RETURN public._backup_household(v_household);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_household_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_backup() TO authenticated, service_role;

-- Wöchentlicher Lauf über alle Haushalte (nur für cron/service_role)
CREATE OR REPLACE FUNCTION public.run_all_household_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.households LOOP
    PERFORM public._backup_household(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_all_household_backups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_all_household_backups() TO service_role;

-- Zeitplan: jeden Montag 03:00 UTC
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN
    PERFORM cron.unschedule('weekly-household-backups');
  EXCEPTION WHEN others THEN
    NULL; -- Job existierte noch nicht
  END;
  PERFORM cron.schedule('weekly-household-backups', '0 3 * * 1', 'SELECT public.run_all_household_backups()');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron nicht verfügbar — nur manuelle Backups möglich: %', SQLERRM;
END $$;
