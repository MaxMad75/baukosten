import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Household } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  household: Household | null;
  householdProfiles: Profile[];
  loading: boolean;
  signUp: (email: string, password: string, name: string, iban?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdProfiles, setHouseholdProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);

      // Fetch household
      const { data: householdData } = await supabase
        .from('households')
        .select('*')
        .eq('id', profileData.household_id)
        .single();

      if (householdData) {
        setHousehold(householdData as Household);
      }

      // Fetch all profiles in household
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('household_id', profileData.household_id);

      if (profiles) {
        setHouseholdProfiles(profiles as Profile[]);
      }
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setHousehold(null);
          setHouseholdProfiles([]);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string, iban?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      // Sign up the user first (must be authenticated before creating household)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (authError) {
        return { error: authError };
      }

      if (authData.user) {
        // Now authenticated — create household and profile
        const householdId = crypto.randomUUID();
        const { error: householdError } = await supabase
          .from('households')
          .insert({ id: householdId, name: 'Mein Haushalt' });

        if (householdError) {
          return { error: new Error(householdError.message) };
        }

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: authData.user.id,
            household_id: householdId,
            name,
            iban: iban || null,
          });

        if (profileError) {
          return { error: new Error('Failed to create profile') };
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setHousehold(null);
    setHouseholdProfiles([]);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        household,
        householdProfiles,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
