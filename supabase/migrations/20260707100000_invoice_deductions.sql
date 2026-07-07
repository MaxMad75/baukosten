-- Abzüge aus der Rechnungsprüfung (Skonto, Sicherheitseinbehalt, Anteil
-- Baustrom, Anteil Bauwesenversicherung, Sonstiges). Der Zahlbetrag einer
-- Rechnung ist amount - SUM(deductions); der Status-Trigger wertet
-- "bezahlt" gegen den Zahlbetrag, damit Rechnung und Überweisung
-- übereinstimmen.

CREATE TABLE IF NOT EXISTS public.invoice_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  deduction_type text NOT NULL, -- skonto | sicherheitseinbehalt | baustrom | bauwesenversicherung | sonstiges
  label text NULL,              -- Freitext, v. a. für "sonstiges"
  is_percentage boolean NOT NULL DEFAULT false,
  percentage numeric NULL,      -- nur gesetzt, wenn is_percentage
  amount numeric NOT NULL,      -- immer der berechnete absolute Abzug
  notes text NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoice_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view deductions in their household" ON public.invoice_deductions;
CREATE POLICY "Users can view deductions in their household"
  ON public.invoice_deductions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_deductions.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can insert deductions in their household" ON public.invoice_deductions;
CREATE POLICY "Users can insert deductions in their household"
  ON public.invoice_deductions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_deductions.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can update deductions in their household" ON public.invoice_deductions;
CREATE POLICY "Users can update deductions in their household"
  ON public.invoice_deductions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_deductions.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can delete deductions in their household" ON public.invoice_deductions;
CREATE POLICY "Users can delete deductions in their household"
  ON public.invoice_deductions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_deductions.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

-- Statusberechnung: "bezahlt" gilt jetzt gegen den Zahlbetrag
-- (Rechnungsbetrag minus Abzüge).
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
  FROM public.invoice_payments WHERE invoice_id = v_invoice_id;

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
  WHERE invoice_id = v_invoice_id
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

-- Abzüge ändern den Zahlbetrag → Status ebenfalls neu berechnen
DROP TRIGGER IF EXISTS trg_recalc_invoice_status_deductions ON public.invoice_deductions;
CREATE TRIGGER trg_recalc_invoice_status_deductions
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_deductions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_payment_status();
