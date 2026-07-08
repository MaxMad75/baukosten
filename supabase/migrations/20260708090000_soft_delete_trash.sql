-- Papierkorb (Plan N.3): Rechnungen und Zahlungen werden nur markiert
-- (deleted_at), 30 Tage lang wiederherstellbar; endgültiges Löschen macht
-- der Client (Papierkorb leeren bzw. automatische Bereinigung beim Laden).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Duplikat-Schutz darf gelöschte Rechnungen nicht blockieren
DROP INDEX IF EXISTS invoices_household_company_invoiceno_uniq;
DO $$
BEGIN
  CREATE UNIQUE INDEX invoices_household_company_invoiceno_uniq
    ON public.invoices (household_id, lower(trim(company_name)), lower(trim(invoice_number)))
    WHERE invoice_number IS NOT NULL AND trim(invoice_number) <> '' AND deleted_at IS NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Unique index skipped (existing duplicates?): %', SQLERRM;
END $$;

-- Statusberechnung: soft-gelöschte Zahlungen zählen nicht mehr.
-- (Soft-Delete/Restore ist ein UPDATE auf invoice_payments und triggert
-- damit automatisch die Neuberechnung.)
CREATE OR REPLACE FUNCTION public.recalc_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_amount numeric;
  v_status text;
  v_deductions numeric;
  v_payable numeric;
  v_total_paid numeric;
  v_new_status text;
  v_latest_date date;
  v_latest_profile uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT amount, status INTO v_amount, v_status
  FROM public.invoices WHERE id = v_invoice_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_deductions
  FROM public.invoice_deductions WHERE invoice_id = v_invoice_id;

  v_payable := GREATEST(v_amount - v_deductions, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.invoice_payments
  WHERE invoice_id = v_invoice_id AND deleted_at IS NULL;

  IF v_status = 'cancelled' THEN
    v_new_status := 'cancelled';
  ELSIF v_total_paid > 0 AND v_total_paid >= v_payable - 0.01 THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF v_status IN ('paid', 'partially_paid') THEN
    v_new_status := 'approved';
  ELSE
    v_new_status := v_status;
  END IF;

  SELECT payment_date, profile_id INTO v_latest_date, v_latest_profile
  FROM public.invoice_payments
  WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
  ORDER BY payment_date DESC, created_at DESC
  LIMIT 1;

  UPDATE public.invoices SET
    status = v_new_status,
    is_paid = (v_new_status = 'paid'),
    payment_date = CASE WHEN v_new_status = 'paid' THEN v_latest_date ELSE NULL END,
    paid_by_profile_id = CASE WHEN v_new_status = 'paid' THEN v_latest_profile ELSE NULL END
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
