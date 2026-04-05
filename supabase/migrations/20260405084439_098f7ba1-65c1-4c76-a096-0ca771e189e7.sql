
-- Corrective migration: fix estimate_versions data
-- 1. Renumber versions sequentially per household
-- 2. Set distinct names
-- 3. Enforce single active per household
-- 4. Sync architect_estimates.is_active

DO $$
DECLARE
  hh_rec RECORD;
  v_rec RECORD;
  seq integer;
  active_version_id uuid;
BEGIN
  -- Process each household
  FOR hh_rec IN SELECT DISTINCT household_id FROM public.estimate_versions LOOP
    seq := 0;
    active_version_id := NULL;

    -- Renumber versions sequentially by created_at
    FOR v_rec IN
      SELECT id, name, version_number
      FROM public.estimate_versions
      WHERE household_id = hh_rec.household_id
      ORDER BY created_at ASC
    LOOP
      seq := seq + 1;

      -- Update version_number; update name only if it matches the old default pattern
      UPDATE public.estimate_versions
      SET version_number = seq,
          is_active = false,
          name = CASE
            WHEN name = 'V' || v_rec.version_number THEN 'V' || seq
            ELSE name
          END
      WHERE id = v_rec.id;

      -- Track last one as the active candidate (highest number)
      active_version_id := v_rec.id;
    END LOOP;

    -- Set the highest-numbered version as active
    IF active_version_id IS NOT NULL THEN
      UPDATE public.estimate_versions
      SET is_active = true
      WHERE id = active_version_id;
    END IF;

    -- Sync architect_estimates.is_active
    UPDATE public.architect_estimates
    SET is_active = false
    WHERE household_id = hh_rec.household_id;

    IF active_version_id IS NOT NULL THEN
      UPDATE public.architect_estimates
      SET is_active = true
      WHERE version_id = active_version_id;
    END IF;
  END LOOP;
END $$;
