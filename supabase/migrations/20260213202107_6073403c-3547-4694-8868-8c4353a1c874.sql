
-- Make user_id nullable for placeholder profiles
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing insert policy that requires user_id = auth.uid()
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Re-create insert policy: allow inserting own profile OR placeholder profiles in own household
CREATE POLICY "Users can insert profiles in their household"
ON public.profiles
FOR INSERT
WITH CHECK (
  (user_id = auth.uid())
  OR
  (user_id IS NULL AND household_id = get_user_household_id())
);
