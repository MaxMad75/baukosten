import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export const useHouseholdProfiles = () => {
  const { household } = useAuth();

  return useQuery({
    queryKey: ['household_profiles', household?.id],
    queryFn: async () => {
      if (!household?.id) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, household_id, name, created_at, updated_at')
        .eq('household_id', household.id);

      if (error) throw error;
      return (data as unknown as Profile[]);
    },
    enabled: !!household?.id,
  });
};
