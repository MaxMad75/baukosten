import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ConstructionJournalEntry } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useConstructionJournal() {
  const { household, profile } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ConstructionJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('construction_journal')
      .select('*')
      .eq('household_id', household.id)
      .order('entry_date', { ascending: false });

    if (error) {
      toast({ title: 'Fehler', description: 'Tagebucheinträge konnten nicht geladen werden', variant: 'destructive' });
    } else {
      setEntries((data as ConstructionJournalEntry[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [household]);

  const createEntry = async (data: {
    entry_date: string;
    title: string;
    description: string;
    category?: string;
    contractor_id?: string;
    photos?: string[];
  }) => {
    if (!household || !profile) return null;
    const { data: result, error } = await supabase
      .from('construction_journal')
      .insert({
        household_id: household.id,
        entry_date: data.entry_date,
        title: data.title,
        description: data.description,
        category: data.category || null,
        contractor_id: data.contractor_id || null,
        photos: data.photos || null,
        created_by_profile_id: profile.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Eintrag konnte nicht erstellt werden', variant: 'destructive' });
      return null;
    }
    await fetchEntries();
    toast({ title: 'Erfolg', description: 'Eintrag wurde hinzugefügt' });
    return result as ConstructionJournalEntry;
  };

  const updateEntry = async (id: string, updates: Partial<ConstructionJournalEntry>) => {
    const { error } = await supabase
      .from('construction_journal')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Eintrag konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchEntries();
    toast({ title: 'Erfolg', description: 'Eintrag wurde aktualisiert' });
    return true;
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase
      .from('construction_journal')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Eintrag konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchEntries();
    toast({ title: 'Erfolg', description: 'Eintrag wurde gelöscht' });
    return true;
  };

  const uploadPhoto = async (file: File) => {
    if (!household) return null;
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filePath = `${household.id}/${yearMonth}/${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from('journal-photos')
      .upload(filePath, file);

    if (error) {
      toast({ title: 'Fehler', description: 'Foto konnte nicht hochgeladen werden', variant: 'destructive' });
      return null;
    }
    return filePath;
  };

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('journal-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const getSignedPhotoUrl = async (path: string) => {
    const { data } = await supabase.storage.from('journal-photos').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  return {
    entries,
    loading,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    uploadPhoto,
    getPhotoUrl,
    getSignedPhotoUrl,
  };
}
