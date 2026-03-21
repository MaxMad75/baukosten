
CREATE TABLE public.invoice_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric NOT NULL,
  percentage numeric,
  split_type text NOT NULL DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoice_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view splits in their household" ON public.invoice_splits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_splits.invoice_id AND invoices.household_id = get_user_household_id())
  );

CREATE POLICY "Users can insert splits in their household" ON public.invoice_splits
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_splits.invoice_id AND invoices.household_id = get_user_household_id())
  );

CREATE POLICY "Users can update splits in their household" ON public.invoice_splits
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_splits.invoice_id AND invoices.household_id = get_user_household_id())
  );

CREATE POLICY "Users can delete splits in their household" ON public.invoice_splits
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_splits.invoice_id AND invoices.household_id = get_user_household_id())
  );
