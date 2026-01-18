-- Create household_invitations table for inviting users to households
CREATE TABLE public.household_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- Policies: Members can view/create invitations for their household
CREATE POLICY "Users can view invitations for their household"
  ON public.household_invitations
  FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can create invitations for their household"
  ON public.household_invitations
  FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update invitations for their household"
  ON public.household_invitations
  FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete invitations for their household"
  ON public.household_invitations
  FOR DELETE
  USING (household_id = get_user_household_id());