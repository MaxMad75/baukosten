DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  household_id,
  name,
  CASE WHEN user_id = auth.uid() THEN iban ELSE NULL END AS iban,
  created_at,
  updated_at
FROM public.profiles;