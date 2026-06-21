
CREATE OR REPLACE FUNCTION public.get_user_household_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT household_id FROM public.profiles
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_household_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_household_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can insert profiles in their household" ON public.profiles;
CREATE POLICY "Users can insert profiles in their household"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid())
  )
  OR
  (user_id IS NULL AND household_id = public.get_user_household_id())
);

DROP POLICY IF EXISTS "Users can update profiles in their household" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND household_id = public.get_user_household_id()
);

CREATE POLICY "Users can update placeholder profiles in their household"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id IS NULL AND household_id = public.get_user_household_id())
WITH CHECK (user_id IS NULL AND household_id = public.get_user_household_id());

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_iban boolean
  GENERATED ALWAYS AS (iban IS NOT NULL AND length(btrim(iban)) > 0) STORED;

REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT
  (id, user_id, household_id, name, has_iban, created_at, updated_at)
  ON public.profiles TO authenticated;

GRANT SELECT ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_iban()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT iban FROM public.profiles
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_iban() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_iban() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view invitations for their household" ON public.household_invitations;
CREATE POLICY "Users can view invitations they created"
ON public.household_invitations
FOR SELECT
TO authenticated
USING (
  household_id = public.get_user_household_id()
  AND invited_by_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);
