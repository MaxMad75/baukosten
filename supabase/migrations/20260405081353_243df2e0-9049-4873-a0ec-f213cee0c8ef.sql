
-- 1. Create estimate_versions table
CREATE TABLE public.estimate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add version_id to architect_estimates
ALTER TABLE public.architect_estimates
  ADD COLUMN version_id uuid REFERENCES public.estimate_versions(id);

-- 3. Enable RLS on estimate_versions
ALTER TABLE public.estimate_versions ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for estimate_versions
CREATE POLICY "Users can view estimate versions in their household"
  ON public.estimate_versions FOR SELECT TO public
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert estimate versions in their household"
  ON public.estimate_versions FOR INSERT TO public
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update estimate versions in their household"
  ON public.estimate_versions FOR UPDATE TO public
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete estimate versions in their household"
  ON public.estimate_versions FOR DELETE TO public
  USING (household_id = get_user_household_id());

-- 5. Data migration: create estimate_versions from existing architect_estimates
-- For each family (grouped by COALESCE(parent_id, id)), create one version per distinct version_number
-- Then link architect_estimates to the new version rows
DO $$
DECLARE
  rec RECORD;
  new_version_id uuid;
BEGIN
  -- Group by household + family root + version_number
  FOR rec IN
    SELECT
      ae.household_id,
      COALESCE(ae.parent_id, ae.id) AS root_id,
      ae.version_number,
      bool_or(ae.is_active) AS any_active
    FROM public.architect_estimates ae
    GROUP BY ae.household_id, COALESCE(ae.parent_id, ae.id), ae.version_number
    ORDER BY ae.household_id, root_id, ae.version_number
  LOOP
    -- Create a version row
    INSERT INTO public.estimate_versions (household_id, version_number, name, is_active)
    VALUES (
      rec.household_id,
      rec.version_number,
      'V' || rec.version_number,
      rec.any_active
    )
    RETURNING id INTO new_version_id;

    -- Link all architect_estimates in this family+version to the new version
    UPDATE public.architect_estimates
    SET version_id = new_version_id
    WHERE household_id = rec.household_id
      AND COALESCE(parent_id, id) = rec.root_id
      AND version_number = rec.version_number;
  END LOOP;
END $$;
