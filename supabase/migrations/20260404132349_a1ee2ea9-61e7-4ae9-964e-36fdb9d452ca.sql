
-- Create invoice_allocations table
CREATE TABLE public.invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kostengruppe_code text NOT NULL,
  estimate_item_id uuid REFERENCES public.architect_estimate_items(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies (same JOIN-through-invoices pattern)
CREATE POLICY "Users can view allocations in their household"
  ON public.invoice_allocations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_allocations.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can insert allocations in their household"
  ON public.invoice_allocations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_allocations.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can update allocations in their household"
  ON public.invoice_allocations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_allocations.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can delete allocations in their household"
  ON public.invoice_allocations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_allocations.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

-- Seed: migrate existing invoices with kostengruppe_code into allocations
INSERT INTO public.invoice_allocations (invoice_id, kostengruppe_code, amount)
SELECT id, kostengruppe_code, amount
FROM public.invoices
WHERE kostengruppe_code IS NOT NULL;
