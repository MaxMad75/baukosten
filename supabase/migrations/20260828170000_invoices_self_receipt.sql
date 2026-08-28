-- Eigenbeleg (Epic A): Kosten erfassen, für die keine Fremdrechnung vorliegt —
-- Barzahlungen, Eigenleistung, oder ein Sammelbeleg, der mehrere Kleinbelege
-- zu einer Position bündelt. Bisher entstehen Rechnungen ausschließlich aus
-- einem Dokumenten-Upload; ein Eigenbeleg hat per Definition keine Fremddatei.
--
-- Das Bündeln selbst braucht kein neues Schema: documents.invoice_id ist
-- bereits N:1, mehrere Belege dürfen also auf denselben Eigenbeleg zeigen.
-- Neu ist nur das Kennzeichen und ein eigener Nummernkreis.
--
-- Idempotent; manuell im Supabase-SQL-Editor ausführen.

-- 1. Kennzeichen -------------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_self_receipt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.is_self_receipt IS
  'true = selbst ausgestellter Beleg (Eigenbeleg/Sammelbeleg) statt Fremdrechnung';

-- Teilindex: die Liste filtert auf genau diese Teilmenge, die klein bleibt.
CREATE INDEX IF NOT EXISTS idx_invoices_self_receipt
  ON public.invoices(household_id, invoice_date DESC)
  WHERE is_self_receipt;

-- 2. Nummernkreis ------------------------------------------------------------

-- Eigenbelege bekommen EB-JJJJ-NNN, fortlaufend je Haushalt und Jahr. Die
-- Vergabe gehört in die Datenbank und nicht in den Client: zwei Browser, die
-- gleichzeitig speichern, würden sonst dieselbe Nummer ziehen.
--
-- Der bestehende Unique-Index läuft über (household, company_name,
-- invoice_number); hier wird über den ganzen Haushalt gezählt, die Nummer ist
-- also strenger eindeutig als der Index verlangt.
--
-- SECURITY DEFINER, weil über alle Rechnungen des Haushalts gezählt wird;
-- der Haushalt kommt aus get_user_household_id() und nicht aus dem Aufruf,
-- damit niemand über einen fremden Haushalt zählen kann.
CREATE OR REPLACE FUNCTION public.next_self_receipt_number(p_year integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household uuid := public.get_user_household_id();
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_prefix text;
  v_next integer;
BEGIN
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'Kein Haushalt für den aktuellen Benutzer';
  END IF;

  v_prefix := 'EB-' || v_year::text || '-';

  -- Gelöschte zählen mit: eine im Papierkorb liegende Nummer darf nicht
  -- erneut vergeben werden, sonst kollidiert sie beim Wiederherstellen.
  SELECT COALESCE(MAX(substring(invoice_number FROM '\d+$')::integer), 0) + 1
    INTO v_next
    FROM public.invoices
   WHERE household_id = v_household
     AND is_self_receipt
     AND invoice_number ~ ('^' || v_prefix || '\d+$');

  RETURN v_prefix || lpad(v_next::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_self_receipt_number(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.next_self_receipt_number(integer) TO authenticated;

COMMENT ON FUNCTION public.next_self_receipt_number(integer) IS
  'Nächste freie Eigenbeleg-Nummer EB-JJJJ-NNN für den Haushalt des Aufrufers';

-- 3. Kontrolle ---------------------------------------------------------------

-- next_self_receipt_number() wird hier bewusst NICHT aufgerufen: im
-- SQL-Editor gibt es keinen angemeldeten App-Benutzer, auth.uid() ist NULL,
-- und die Funktion weist einen Aufruf ohne Haushalt korrekt zurück. Getestet
-- wird sie aus der App heraus.

SELECT
  count(*) FILTER (WHERE is_self_receipt)     AS eigenbelege,
  count(*) FILTER (WHERE NOT is_self_receipt) AS fremdrechnungen
FROM public.invoices;

-- Ist die Spalte da?
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'is_self_receipt';

-- Ist die Funktion da und darf die App sie ausführen?
SELECT p.proname AS funktion,
       pg_get_function_identity_arguments(p.oid) AS argumente,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_darf
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'next_self_receipt_number';
