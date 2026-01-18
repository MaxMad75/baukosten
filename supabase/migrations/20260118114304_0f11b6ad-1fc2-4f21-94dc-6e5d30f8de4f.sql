-- Drop existing storage policies for invoices and estimates buckets
DROP POLICY IF EXISTS "Users can view invoice files in their household" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload invoice files in their household" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete invoice files in their household" ON storage.objects;
DROP POLICY IF EXISTS "Users can view estimate files in their household" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload estimate files in their household" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete estimate files in their household" ON storage.objects;

-- Create secure storage policies for invoices bucket that verify household ownership
CREATE POLICY "Users can view invoice files in their household"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );

CREATE POLICY "Users can upload invoice files in their household"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );

CREATE POLICY "Users can delete invoice files in their household"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );

-- Create secure storage policies for estimates bucket that verify household ownership
CREATE POLICY "Users can view estimate files in their household"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );

CREATE POLICY "Users can upload estimate files in their household"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );

CREATE POLICY "Users can delete estimate files in their household"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_user_household_id()::text
  );