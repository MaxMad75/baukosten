
-- Create estimate_blocks table
CREATE TABLE public.estimate_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id) ON DELETE CASCADE,
  block_type text NOT NULL DEFAULT 'manual',
  label text NOT NULL,
  file_path text,
  file_name text,
  source_block_id uuid,
  processed boolean NOT NULL DEFAULT false,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add block_id to architect_estimate_items (nullable for legacy)
ALTER TABLE public.architect_estimate_items
  ADD COLUMN block_id uuid REFERENCES public.estimate_blocks(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.estimate_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies: join through estimate_versions → household
CREATE POLICY "Users can view blocks in their household"
  ON public.estimate_blocks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.estimate_versions ev
    WHERE ev.id = estimate_blocks.version_id
      AND ev.household_id = public.get_user_household_id()
  ));

CREATE POLICY "Users can insert blocks in their household"
  ON public.estimate_blocks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estimate_versions ev
    WHERE ev.id = estimate_blocks.version_id
      AND ev.household_id = public.get_user_household_id()
  ));

CREATE POLICY "Users can update blocks in their household"
  ON public.estimate_blocks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.estimate_versions ev
    WHERE ev.id = estimate_blocks.version_id
      AND ev.household_id = public.get_user_household_id()
  ));

CREATE POLICY "Users can delete blocks in their household"
  ON public.estimate_blocks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.estimate_versions ev
    WHERE ev.id = estimate_blocks.version_id
      AND ev.household_id = public.get_user_household_id()
  ));
