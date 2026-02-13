import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Contractor } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useContractors() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContractors = async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('contractors')
      .select('*')
      .eq('household_id', household.id)
      .order('company_name');

    if (error) {
      toast({ title: 'Fehler', description: 'Firmen konnten nicht geladen werden', variant: 'destructive' });
    } else {
      setContractors((data as Contractor[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContractors();
  }, [household]);

  const createContractor = async (data: {
    company_name: string;
    trade?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    website?: string;
    notes?: string;
    rating?: number;
  }) => {
    if (!household) return null;
    const { data: result, error } = await supabase
      .from('contractors')
      .insert({
        household_id: household.id,
        company_name: data.company_name,
        trade: data.trade || null,
        contact_person: data.contact_person || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        notes: data.notes || null,
        rating: data.rating || null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Firma konnte nicht erstellt werden', variant: 'destructive' });
      return null;
    }
    await fetchContractors();
    toast({ title: 'Erfolg', description: 'Firma wurde hinzugefügt' });
    return result as Contractor;
  };

  const updateContractor = async (id: string, updates: Partial<Contractor>) => {
    const { error } = await supabase
      .from('contractors')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Firma konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchContractors();
    toast({ title: 'Erfolg', description: 'Firma wurde aktualisiert' });
    return true;
  };

  const deleteContractor = async (id: string) => {
    const { error } = await supabase
      .from('contractors')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Firma konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchContractors();
    toast({ title: 'Erfolg', description: 'Firma wurde gelöscht' });
    return true;
  };

  return { contractors, loading, fetchContractors, createContractor, updateContractor, deleteContractor };
}
