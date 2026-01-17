-- Allow authenticated users to insert new households (needed for signup)
CREATE POLICY "Users can create households"
ON public.households
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow anon users to create households during signup process
CREATE POLICY "Anon users can create households during signup"
ON public.households
FOR INSERT
TO anon
WITH CHECK (true);