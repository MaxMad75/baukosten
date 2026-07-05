-- Guard against duplicate invoices: same household + company + invoice
-- number must be unique. Wrapped in a DO block so the migration does not
-- fail if existing data already contains duplicates — in that case the
-- index is skipped with a notice and can be created after a manual
-- cleanup (see docs/OPTIMIERUNGSPLAN.md 1.2).

DO $$
BEGIN
  CREATE UNIQUE INDEX invoices_household_company_invoiceno_uniq
    ON public.invoices (household_id, lower(trim(company_name)), lower(trim(invoice_number)))
    WHERE invoice_number IS NOT NULL AND trim(invoice_number) <> '';
EXCEPTION
  WHEN duplicate_table THEN
    NULL; -- index already exists
  WHEN others THEN
    RAISE NOTICE 'Unique index skipped (existing duplicates?): %', SQLERRM;
END $$;
