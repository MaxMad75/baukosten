-- Derive invoice payment status from invoice_payments on the server.
-- Until now the status was recalculated in the client
-- (useInvoicePayments.recalculateInvoiceStatus), which can drift on
-- concurrent edits or aborted requests. This trigger makes the DB
-- authoritative; the client logic stays as a harmless no-op writer
-- until it is removed (see docs/OPTIMIERUNGSPLAN.md 1.4).

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
  v_total_paid numeric;
  v_new_status text;
  v_latest_date date;
  v_latest_profile uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT amount, status INTO v_amount, v_status
  FROM public.invoices WHERE id = v_invoice_id;

  -- Invoice already gone (payment deleted via ON DELETE CASCADE)
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.invoice_payments WHERE invoice_id = v_invoice_id;

  -- Mirrors the client-side deriveStatus logic
  IF v_status = 'cancelled' THEN
    v_new_status := 'cancelled';
  ELSIF v_total_paid > 0 AND v_total_paid >= v_amount - 0.01 THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF v_status IN ('paid', 'partially_paid') THEN
    -- payments removed: fall back to approved, not draft
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

DROP TRIGGER IF EXISTS trg_recalc_invoice_status ON public.invoice_payments;
CREATE TRIGGER trg_recalc_invoice_status
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_payment_status();

-- One-time repair: fix invoices whose status diverges from their payments.
-- Deliberately limited to invoices that HAVE payments — legacy invoices
-- marked paid without payment rows keep their status until the data
-- migration in step 1.4.
UPDATE public.invoices i SET
  status = calc.new_status,
  is_paid = (calc.new_status = 'paid'),
  payment_date = CASE WHEN calc.new_status = 'paid' THEN calc.latest_date ELSE NULL END,
  paid_by_profile_id = CASE WHEN calc.new_status = 'paid' THEN calc.latest_profile ELSE NULL END
FROM (
  SELECT
    i2.id,
    CASE
      WHEN i2.status = 'cancelled' THEN 'cancelled'
      WHEN p.total >= i2.amount - 0.01 THEN 'paid'
      ELSE 'partially_paid'
    END AS new_status,
    p.latest_date,
    p.latest_profile
  FROM public.invoices i2
  JOIN LATERAL (
    SELECT
      SUM(ip.amount) AS total,
      (SELECT payment_date FROM public.invoice_payments
        WHERE invoice_id = i2.id ORDER BY payment_date DESC, created_at DESC LIMIT 1) AS latest_date,
      (SELECT profile_id FROM public.invoice_payments
        WHERE invoice_id = i2.id ORDER BY payment_date DESC, created_at DESC LIMIT 1) AS latest_profile
    FROM public.invoice_payments ip
    WHERE ip.invoice_id = i2.id
    HAVING SUM(ip.amount) > 0
  ) p ON TRUE
) calc
WHERE calc.id = i.id
  AND (i.status IS DISTINCT FROM calc.new_status
    OR i.is_paid IS DISTINCT FROM (calc.new_status = 'paid'));
