
-- Add versioning columns to architect_estimates
ALTER TABLE public.architect_estimates 
  ADD COLUMN parent_id uuid REFERENCES public.architect_estimates(id) ON DELETE SET NULL,
  ADD COLUMN version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN notes text;

-- Migrate existing data: all existing estimates become version 1, active
UPDATE public.architect_estimates SET version_number = 1, is_active = true WHERE version_number = 1;
