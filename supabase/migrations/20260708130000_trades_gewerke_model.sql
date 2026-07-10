-- R1.1 Gewerke-Datenmodell (SRS 4.1): trades + trade_estimates + invoices.trade_id.
-- Das Gewerk ist die Zeile aus dem Architekten-Excel; DIN 276 bleibt nur als
-- Abschnitts-Gruppierung (section 100-800). Beträge folgen der bestehenden
-- Konvention tax_status net|gross|tax_free (Umrechnung in der Ansicht).
-- Idempotent; wird wie immer manuell im Supabase-SQL-Editor ausgeführt.

CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  section integer NOT NULL DEFAULT 300 CHECK (section IN (100,200,300,400,500,600,700,800)),
  contractor_id uuid NULL REFERENCES public.contractors(id) ON DELETE SET NULL,
  skonto_percent numeric NULL,
  -- "günstigste oder beauftragt": NULL = noch nicht beauftragt (Ansicht setzt
  -- Schätzwert kursiv an), 0 = bewusst 0 (Leistung in anderem Gewerk enthalten)
  awarded_amount numeric NULL,
  awarded_tax_status text NOT NULL DEFAULT 'net' CHECK (awarded_tax_status IN ('net','gross','tax_free')),
  awarded_note text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trade_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  version_label text NOT NULL,          -- "Kostenberechnung vom 02.03.2026"
  estimate_date date NULL,
  amount numeric NOT NULL,
  tax_status text NOT NULL DEFAULT 'net' CHECK (tax_status IN ('net','gross','tax_free')),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, version_label)
);

CREATE INDEX IF NOT EXISTS idx_trades_household ON public.trades(household_id);
CREATE UNIQUE INDEX IF NOT EXISTS trades_household_name_uniq
  ON public.trades (household_id, lower(trim(name)))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trade_estimates_trade ON public.trade_estimates(trade_id);
CREATE UNIQUE INDEX IF NOT EXISTS trade_estimates_current_uniq
  ON public.trade_estimates(trade_id)
  WHERE is_current;

-- Primäre Gewerk-Zuordnung der Rechnung (Standard 1 Rechnung : 1 Gewerk)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS trade_id uuid NULL REFERENCES public.trades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_trade ON public.invoices(trade_id);

-- Mehrfach-Zuordnung als Ausnahme: invoice_allocations bekommt trade_id
-- (löst kostengruppe_code als Ziel ab; Umstellung des Flows folgt in R1.3/R1.6)
ALTER TABLE public.invoice_allocations
  ADD COLUMN IF NOT EXISTS trade_id uuid NULL REFERENCES public.trades(id) ON DELETE SET NULL;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view trades in their household" ON public.trades;
CREATE POLICY "Users can view trades in their household"
  ON public.trades FOR SELECT
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can insert trades in their household" ON public.trades;
CREATE POLICY "Users can insert trades in their household"
  ON public.trades FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can update trades in their household" ON public.trades;
CREATE POLICY "Users can update trades in their household"
  ON public.trades FOR UPDATE
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can delete trades in their household" ON public.trades;
CREATE POLICY "Users can delete trades in their household"
  ON public.trades FOR DELETE
  USING (household_id = get_user_household_id());

DROP POLICY IF EXISTS "Users can view trade estimates in their household" ON public.trade_estimates;
CREATE POLICY "Users can view trade estimates in their household"
  ON public.trade_estimates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trades
    WHERE trades.id = trade_estimates.trade_id
    AND trades.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can insert trade estimates in their household" ON public.trade_estimates;
CREATE POLICY "Users can insert trade estimates in their household"
  ON public.trade_estimates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trades
    WHERE trades.id = trade_estimates.trade_id
    AND trades.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can update trade estimates in their household" ON public.trade_estimates;
CREATE POLICY "Users can update trade estimates in their household"
  ON public.trade_estimates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.trades
    WHERE trades.id = trade_estimates.trade_id
    AND trades.household_id = get_user_household_id()
  ));

DROP POLICY IF EXISTS "Users can delete trade estimates in their household" ON public.trade_estimates;
CREATE POLICY "Users can delete trade estimates in their household"
  ON public.trade_estimates FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.trades
    WHERE trades.id = trade_estimates.trade_id
    AND trades.household_id = get_user_household_id()
  ));

DROP TRIGGER IF EXISTS update_trades_updated_at ON public.trades;
CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
