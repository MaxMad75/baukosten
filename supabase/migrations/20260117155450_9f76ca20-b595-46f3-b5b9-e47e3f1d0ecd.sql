-- Make household insert policies non-trivial (avoid WITH CHECK (true))
ALTER POLICY "Users can create households" ON public.households
WITH CHECK (name IS NOT NULL);

ALTER POLICY "Anon users can create households during signup" ON public.households
WITH CHECK (name IS NOT NULL);