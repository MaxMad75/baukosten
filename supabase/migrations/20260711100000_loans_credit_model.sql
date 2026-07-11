-- R3.1 Kredit-Modul Datenmodell (SRS 4.4): loans + loan_shares + loan_payments.
-- Zinsen = echte Baukosten (fließen clientseitig in das Abschnitt-800-Gewerk
-- "Finanzierung"); Tilgung = Vermögensverschiebung Kredit→Kreditnehmer gemäß
-- loan_shares (kein Kostenposten). Das virtuelle Haushaltsmitglied "Kredit"
-- bleibt Zahler auf Rechnungsebene — dieses Modul verteilt dessen Topf
-- nachträglich. Idempotent; manuell im Supabase-SQL-Editor ausführen.

CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- z. B. "Annuitätendarlehen Hausbank"
  bank text NULL,
  principal numeric NULL,                -- Darlehenssumme
  interest_rate_percent numeric NULL,    -- Sollzins p. a. (informativ)
  start_date date NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kreditnehmer-Anteile: wohin Tilgung als Vermögen wandert (Summe = 100)
CREATE TABLE IF NOT EXISTS public.loan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_percent numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, profile_id)
);

-- Raten: total = interest (Zins, Kosten) + principal (Tilgung, Vermögensverschiebung)
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  total_amount numeric NOT NULL,
  interest_amount numeric NOT NULL DEFAULT 0,
  principal_amount numeric NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_household ON public.loans(household_id);
CREATE INDEX IF NOT EXISTS idx_loan_shares_loan ON public.loan_shares(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON public.loan_payments(payment_date);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view loans in their household" ON public.loans;
CREATE POLICY "Users can view loans in their household"
  ON public.loans FOR SELECT
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can insert loans in their household" ON public.loans;
CREATE POLICY "Users can insert loans in their household"
  ON public.loans FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can update loans in their household" ON public.loans;
CREATE POLICY "Users can update loans in their household"
  ON public.loans FOR UPDATE
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can delete loans in their household" ON public.loans;
CREATE POLICY "Users can delete loans in their household"
  ON public.loans FOR DELETE
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can view loan shares in their household" ON public.loan_shares;
CREATE POLICY "Users can view loan shares in their household"
  ON public.loan_shares FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_shares.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can insert loan shares in their household" ON public.loan_shares;
CREATE POLICY "Users can insert loan shares in their household"
  ON public.loan_shares FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_shares.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can update loan shares in their household" ON public.loan_shares;
CREATE POLICY "Users can update loan shares in their household"
  ON public.loan_shares FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_shares.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can delete loan shares in their household" ON public.loan_shares;
CREATE POLICY "Users can delete loan shares in their household"
  ON public.loan_shares FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_shares.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can view loan payments in their household" ON public.loan_payments;
CREATE POLICY "Users can view loan payments in their household"
  ON public.loan_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_payments.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can insert loan payments in their household" ON public.loan_payments;
CREATE POLICY "Users can insert loan payments in their household"
  ON public.loan_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_payments.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can update loan payments in their household" ON public.loan_payments;
CREATE POLICY "Users can update loan payments in their household"
  ON public.loan_payments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_payments.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can delete loan payments in their household" ON public.loan_payments;
CREATE POLICY "Users can delete loan payments in their household"
  ON public.loan_payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = loan_payments.loan_id
    AND loans.household_id = get_user_household_id()
  ));

DROP TRIGGER IF EXISTS update_loans_updated_at ON public.loans;
CREATE TRIGGER update_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
