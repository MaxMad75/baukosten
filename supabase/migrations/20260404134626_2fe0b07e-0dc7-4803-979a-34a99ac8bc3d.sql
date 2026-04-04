
-- Create offers table
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  document_id uuid,
  contractor_id uuid,
  company_name text NOT NULL,
  title text NOT NULL,
  offer_date date,
  total_amount numeric NOT NULL DEFAULT 0,
  is_gross boolean NOT NULL DEFAULT true,
  notes text,
  created_by_profile_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view offers in their household" ON public.offers FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Users can insert offers in their household" ON public.offers FOR INSERT WITH CHECK (household_id = get_user_household_id());
CREATE POLICY "Users can update offers in their household" ON public.offers FOR UPDATE USING (household_id = get_user_household_id());
CREATE POLICY "Users can delete offers in their household" ON public.offers FOR DELETE USING (household_id = get_user_household_id());

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create offer_items table
CREATE TABLE public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  kostengruppe_code text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  is_gross boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view offer items via offer" ON public.offer_items FOR SELECT USING (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_items.offer_id AND offers.household_id = get_user_household_id()));
CREATE POLICY "Users can insert offer items via offer" ON public.offer_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_items.offer_id AND offers.household_id = get_user_household_id()));
CREATE POLICY "Users can update offer items via offer" ON public.offer_items FOR UPDATE USING (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_items.offer_id AND offers.household_id = get_user_household_id()));
CREATE POLICY "Users can delete offer items via offer" ON public.offer_items FOR DELETE USING (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_items.offer_id AND offers.household_id = get_user_household_id()));
