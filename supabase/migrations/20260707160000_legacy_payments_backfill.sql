-- Plan 1.4: Legacy-Zahlungsdaten in invoice_payments überführen.
-- Danach ist invoice_payments die einzige Quelle für "wer hat was gezahlt";
-- die Fallbacks auf invoice_splits und invoices.paid_by_profile_id entfallen
-- im Client. Idempotent: bereits migrierte Rechnungen (mit Zahlungen) werden
-- übersprungen.

-- 1) Alt-Rechnungen mit Splits, aber ohne Zahlungszeilen:
--    Splits beschreiben die Aufteilung -> eine Zahlung je Split-Zeile.
INSERT INTO public.invoice_payments (invoice_id, profile_id, amount, payment_date)
SELECT s.invoice_id, s.profile_id, s.amount, COALESCE(i.payment_date, i.invoice_date)
FROM public.invoice_splits s
JOIN public.invoices i ON i.id = s.invoice_id
WHERE i.is_paid = true
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = s.invoice_id
  );

-- 2) Alt-Rechnungen ohne Splits und ohne Zahlungszeilen, aber mit
--    paid_by_profile_id: eine Zahlung über den vollen Betrag.
INSERT INTO public.invoice_payments (invoice_id, profile_id, amount, payment_date)
SELECT i.id, i.paid_by_profile_id, i.amount, COALESCE(i.payment_date, i.invoice_date)
FROM public.invoices i
WHERE i.is_paid = true
  AND i.paid_by_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_splits s WHERE s.invoice_id = i.id
  );

-- Kontrolle: sollte 0 Zeilen liefern (bezahlte Rechnungen ohne Zahlungen)
-- SELECT id, company_name FROM public.invoices
-- WHERE is_paid = true
--   AND NOT EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = invoices.id);
