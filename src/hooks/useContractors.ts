import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Contractor } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Match a company name against existing contractors.
 *
 * Deliberately conservative: an exact (case-insensitive) match wins; a
 * substring match is only accepted when it is unambiguous and both names
 * are long enough — otherwise a short name like "Schmidmaier" would
 * silently attach to the wrong company ("Architekt Schmidmaier" vs.
 * "Bauunternehmen Schmidmaier GmbH"). Returns null when no safe match
 * exists.
 */
export function matchContractorByName(contractors: Contractor[], companyName: string): Contractor | null {
  const lower = companyName.trim().toLowerCase();
  if (!lower) return null;

  const exact = contractors.find((c) => c.company_name.trim().toLowerCase() === lower);
  if (exact) return exact;

  if (lower.length >= 5) {
    const candidates = contractors.filter((c) => {
      const other = c.company_name.trim().toLowerCase();
      return other.length >= 5 && (other.includes(lower) || lower.includes(other));
    });
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

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

  /**
   * Find a contractor by company name or create it. Shared by document
   * upload and invoice editing so both sides always resolve to the same
   * contractor. When no safe match exists a new contractor is created;
   * duplicates can be merged on the Contractors page.
   */
  const findOrCreateByName = async (companyName: string): Promise<Contractor | null> => {
    const name = companyName.trim();
    if (!name) return null;
    const match = matchContractorByName(contractors, name);
    if (match) return match;
    return await createContractor({ company_name: name });
  };

  /**
   * Merge duplicate contractors into one: re-points all references
   * (documents, offers, construction journal) to the target and deletes
   * the sources.
   */
  const mergeContractors = async (sourceIds: string[], targetId: string) => {
    const ids = sourceIds.filter((id) => id !== targetId);
    if (ids.length === 0) return false;

    for (const table of ['documents', 'offers', 'construction_journal'] as const) {
      const { error } = await supabase
        .from(table)
        .update({ contractor_id: targetId })
        .in('contractor_id', ids);
      if (error) {
        toast({ title: 'Fehler', description: `Verweise in ${table} konnten nicht umgehängt werden`, variant: 'destructive' });
        return false;
      }
    }

    const { error } = await supabase.from('contractors').delete().in('id', ids);
    if (error) {
      toast({ title: 'Fehler', description: 'Duplikate konnten nicht gelöscht werden', variant: 'destructive' });
      return false;
    }

    await fetchContractors();
    toast({ title: 'Erfolg', description: `${ids.length} Firma/Firmen zusammengeführt` });
    return true;
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

  return { contractors, loading, fetchContractors, createContractor, findOrCreateByName, mergeContractors, updateContractor, deleteContractor };
}
