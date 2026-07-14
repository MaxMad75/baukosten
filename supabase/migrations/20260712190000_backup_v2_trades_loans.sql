-- Backup v2: Das wöchentliche/manuelle DB-Backup (Migration 20260708110000)
-- kannte die nach dem 08.07. eingeführten Kern-Tabellen nicht — Gewerke-Budget
-- (trades, trade_estimates) und Kredit-Modul (loans, loan_shares,
-- loan_payments) fehlten im Snapshot (Review-Fund 12.07.2026, verletzt F2).
-- Idempotent; manuell im Supabase-SQL-Editor ausführen.

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
    'schema_version', 2,
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
    'construction_journal', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.construction_journal t WHERE t.household_id = p_household_id),
    -- NEU in v2: Gewerke-Budget (R1) und Kredit-Modul (R3)
    'trades', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.trades t WHERE t.household_id = p_household_id),
    'trade_estimates', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.trade_estimates t WHERE t.trade_id IN (SELECT id FROM public.trades WHERE household_id = p_household_id)),
    'loans', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.loans t WHERE t.household_id = p_household_id),
    'loan_shares', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.loan_shares t WHERE t.loan_id IN (SELECT id FROM public.loans WHERE household_id = p_household_id)),
    'loan_payments', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.loan_payments t WHERE t.loan_id IN (SELECT id FROM public.loans WHERE household_id = p_household_id))
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

-- Direkt eine v2-Sicherung für alle Haushalte anlegen (nicht bis Montag warten)
SELECT public.run_all_household_backups();
