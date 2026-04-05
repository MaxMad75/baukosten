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
        .from('profiles_safe' as any)
        .select('*')
        .eq('household_id', household.id);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!household?.id,
  });
};
