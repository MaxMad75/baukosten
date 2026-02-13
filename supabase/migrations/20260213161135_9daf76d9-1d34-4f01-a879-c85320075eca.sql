
-- =============================================
-- CONTRACTORS TABLE
-- =============================================
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  company_name text NOT NULL,
  trade text,
  contact_person text,
  phone text,
  email text,
  website text,
  notes text,
  rating integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contractors in their household"
  ON public.contractors FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert contractors in their household"
  ON public.contractors FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update contractors in their household"
  ON public.contractors FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete contractors in their household"
  ON public.contractors FOR DELETE
  USING (household_id = get_user_household_id());

CREATE TRIGGER contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- CONSTRUCTION JOURNAL TABLE
-- =============================================
CREATE TABLE public.construction_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  entry_date date NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  photos text[],
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.construction_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view journal entries in their household"
  ON public.construction_journal FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert journal entries in their household"
  ON public.construction_journal FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update journal entries in their household"
  ON public.construction_journal FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete journal entries in their household"
  ON public.construction_journal FOR DELETE
  USING (household_id = get_user_household_id());

CREATE TRIGGER construction_journal_updated_at
  BEFORE UPDATE ON public.construction_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- STORAGE BUCKET FOR JOURNAL PHOTOS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('journal-photos', 'journal-photos', false);

CREATE POLICY "Users can upload journal photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = get_user_household_id()::text);

CREATE POLICY "Users can view journal photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = get_user_household_id()::text);

CREATE POLICY "Users can delete journal photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = get_user_household_id()::text);
