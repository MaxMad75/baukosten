
-- Add status column to invoices
ALTER TABLE public.invoices ADD COLUMN status text NOT NULL DEFAULT 'draft';

-- Add net_amount and tax_amount columns
ALTER TABLE public.invoices ADD COLUMN net_amount numeric NULL;
ALTER TABLE public.invoices ADD COLUMN tax_amount numeric NULL;

-- Migrate existing data: is_paid = true → status = 'paid'
UPDATE public.invoices SET status = 'paid' WHERE is_paid = true;

-- Create invoice_payments table
CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  notes text NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as invoice_splits)
CREATE POLICY "Users can view payments in their household"
  ON public.invoice_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_payments.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can insert payments in their household"
  ON public.invoice_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_payments.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can update payments in their household"
  ON public.invoice_payments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_payments.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

CREATE POLICY "Users can delete payments in their household"
  ON public.invoice_payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_payments.invoice_id
    AND invoices.household_id = get_user_household_id()
  ));

-- Migrate existing paid invoices to invoice_payments
INSERT INTO public.invoice_payments (invoice_id, profile_id, amount, payment_date)
SELECT id, paid_by_profile_id, amount, COALESCE(payment_date, CURRENT_DATE)
FROM public.invoices
WHERE is_paid = true AND paid_by_profile_id IS NOT NULL;
