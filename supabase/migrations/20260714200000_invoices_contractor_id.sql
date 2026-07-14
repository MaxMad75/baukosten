-- invoices.contractor_id (Backlog aus der Review 12.07.): Rechnungen
-- referenzieren ihre Firma bisher nur als Text (company_name) plus indirekt
-- über das verknüpfte Dokument. Der echte FK macht die Firma→Gewerk-Kette
-- robust gegen Umbenennungen und erlaubt, Rechnungen beim Firmen-Merge
-- mit umzuhängen. Idempotent; manuell im Supabase-SQL-Editor ausführen.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS contractor_id uuid NULL REFERENCES public.contractors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON public.invoices(contractor_id);

-- Backfill 1: über das verknüpfte Dokument (stärkstes vorhandenes Signal)
UPDATE public.invoices i
SET contractor_id = d.contractor_id
FROM public.documents d
WHERE d.invoice_id = i.id
  AND d.contractor_id IS NOT NULL
  AND i.contractor_id IS NULL;

-- Backfill 2: exakter (bereinigter) Namensvergleich — nur wenn der Name im
-- Haushalt eindeutig genau EINER Firma gehört (Dubletten bleiben unberührt)
UPDATE public.invoices i
SET contractor_id = m.cid
FROM (
  SELECT household_id, lower(trim(company_name)) AS cname, (min(id::text))::uuid AS cid
  FROM public.contractors
  GROUP BY household_id, lower(trim(company_name))
  HAVING count(*) = 1
) m
WHERE i.contractor_id IS NULL
  AND m.household_id = i.household_id
  AND m.cname = lower(trim(i.company_name));

-- Kontrolle: wie viele Rechnungen konnten (noch) nicht verknüpft werden?
SELECT
  count(*) FILTER (WHERE contractor_id IS NOT NULL) AS verknuepft,
  count(*) FILTER (WHERE contractor_id IS NULL)     AS ohne_firma
FROM public.invoices;
