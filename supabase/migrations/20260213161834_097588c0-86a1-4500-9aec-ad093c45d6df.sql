
-- =============================================
-- DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  
  -- File info
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  
  -- Metadata
  title text NOT NULL,
  document_type text, -- 'Vertrag', 'Genehmigung', 'Angebot', 'Zeichnung', 'Rechnung', 'Protokoll', 'Sonstiges'
  description text,
  
  -- Relations
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  
  -- AI
  ai_analyzed boolean NOT NULL DEFAULT false,
  ai_summary text,
  
  -- Tracking
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents in their household"
  ON public.documents FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert documents in their household"
  ON public.documents FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update documents in their household"
  ON public.documents FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete documents in their household"
  ON public.documents FOR DELETE
  USING (household_id = get_user_household_id());

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- STORAGE BUCKET FOR DOCUMENTS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "Users can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = get_user_household_id()::text);

CREATE POLICY "Users can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = get_user_household_id()::text);

CREATE POLICY "Users can delete documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = get_user_household_id()::text);
