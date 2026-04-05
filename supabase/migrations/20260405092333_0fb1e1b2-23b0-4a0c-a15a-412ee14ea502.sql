
ALTER TABLE public.architect_estimate_items
  ADD COLUMN tax_status text NOT NULL DEFAULT 'net';

UPDATE public.architect_estimate_items
SET tax_status = CASE WHEN is_gross THEN 'gross' ELSE 'net' END;
