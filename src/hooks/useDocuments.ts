import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Document {
  id: string;
  household_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  title: string;
  document_type: string | null;
  description: string | null;
  contractor_id: string | null;
  ai_analyzed: boolean;
  ai_summary: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useDocuments() {
  const { household, profile } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Fehler', description: 'Dokumente konnten nicht geladen werden', variant: 'destructive' });
    } else {
      setDocuments((data as Document[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, [household]);

  const uploadDocument = async (file: File) => {
    if (!household) return null;
    const filePath = `${household.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documents').upload(filePath, file);
    if (error) {
      toast({ title: 'Fehler', description: 'Datei konnte nicht hochgeladen werden', variant: 'destructive' });
      return null;
    }
    return { path: filePath, name: file.name, size: file.size };
  };

  const createDocument = async (data: {
    file_path: string;
    file_name: string;
    file_size?: number;
    title: string;
    document_type?: string;
    description?: string;
    contractor_id?: string;
    ai_analyzed?: boolean;
    ai_summary?: string;
  }) => {
    if (!household || !profile) return null;
    const { data: result, error } = await supabase
      .from('documents')
      .insert({
        household_id: household.id,
        file_path: data.file_path,
        file_name: data.file_name,
        file_size: data.file_size || null,
        title: data.title,
        document_type: data.document_type || null,
        description: data.description || null,
        contractor_id: data.contractor_id || null,
        ai_analyzed: data.ai_analyzed || false,
        ai_summary: data.ai_summary || null,
        created_by_profile_id: profile.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Dokument konnte nicht gespeichert werden', variant: 'destructive' });
      return null;
    }
    await fetchDocuments();
    toast({ title: 'Erfolg', description: 'Dokument wurde gespeichert' });
    return result as Document;
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    const { error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Dokument konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchDocuments();
    toast({ title: 'Erfolg', description: 'Dokument wurde aktualisiert' });
    return true;
  };

  const deleteDocument = async (id: string) => {
    // Find the document to get file path
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      await supabase.storage.from('documents').remove([doc.file_path]);
    }

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Dokument konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchDocuments();
    toast({ title: 'Erfolg', description: 'Dokument wurde gelöscht' });
    return true;
  };

  const getDocumentUrl = async (path: string) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  return {
    documents,
    loading,
    fetchDocuments,
    uploadDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    getDocumentUrl,
  };
}
