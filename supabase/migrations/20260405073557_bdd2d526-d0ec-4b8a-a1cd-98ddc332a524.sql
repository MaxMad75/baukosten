-- Fix 1: Drop unscoped storage policies on invoices and estimates buckets
DROP POLICY "Users can upload invoice files" ON storage.objects;
DROP POLICY "Users can delete invoice files" ON storage.objects;
DROP POLICY "Users can upload estimate files" ON storage.objects;
DROP POLICY "Users can delete estimate files" ON storage.objects;

-- Fix 2: Drop anon household creation policy (signup creates household after auth)
DROP POLICY "Anon users can create households during signup" ON public.households;

-- Fix 3: Create a secure view for profiles that hides IBAN from other household members
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT
  id,
  user_id,
  household_id,
  name,
  CASE WHEN user_id = auth.uid() THEN iban ELSE NULL END AS iban,
  created_at,
  updated_at
FROM public.profiles;