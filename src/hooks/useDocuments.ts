import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

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
  /** Rohergebnis der letzten KI-Analyse (Debug/Nachvollziehbarkeit) */
  ai_raw_result: Json | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
  file_hash: string | null;
  invoice_id: string | null;
}

export function useDocuments() {
  const { household, profile } = useAuth();
  const { toast } = useToast();
  // React Query (R5): gemeinsamer Cache über alle Seiten/Komponenten —
  // Seitenwechsel lösen keinen Voll-Refetch mehr aus (SRS 5, NFR Performance).
  const queryClient = useQueryClient();
  const { data: documents = [], isPending: loading } = useQuery({
    queryKey: ['documents', household?.id],
    enabled: !!household,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('household_id', household!.id)
        .order('created_at', { ascending: false });
      if (error) {
        toast({ title: 'Fehler', description: 'Dokumente konnten nicht geladen werden', variant: 'destructive' });
        return [] as Document[];
      }
      return (data as Document[]) || [];
    },
  });

  const fetchDocuments = async () => {
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const uploadDocument = async (file: File) => {
    if (!household) return null;
    const sanitizedName = file.name
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/[ß]/g, 'ss')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_');
    const filePath = `${household.id}/${Date.now()}_${sanitizedName}`;
    const { error } = await supabase.storage.from('documents').upload(filePath, file);
    if (error) {
      toast({ title: 'Fehler', description: 'Datei konnte nicht hochgeladen werden', variant: 'destructive' });
      return null;
    }
    return { path: filePath, name: file.name, size: file.size };
  };

  const checkDuplicate = (hash: string): Document | undefined => {
    return documents.find((d) => d.file_hash === hash);
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
    ai_raw_result?: Json | null;
    file_hash?: string;
    invoice_id?: string;
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
        ai_raw_result: data.ai_raw_result || null,
        file_hash: data.file_hash || null,
        invoice_id: data.invoice_id || null,
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

  const deleteDocument = async (id: string, options?: { keepFile?: boolean }) => {
    // Find the document to get file path. Keep the storage file when a
    // linked invoice still references the same path.
    const doc = documents.find((d) => d.id === id);
    if (doc && !options?.keepFile) {
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

  const uploadBatch = async (
    files: { file: File; title: string; folderPath?: string }[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<{ success: number; failed: number; results: { name: string; ok: boolean; error?: string }[] }> => {
    if (!household || !profile) return { success: 0, failed: 0, results: [] };

    const results: { name: string; ok: boolean; error?: string }[] = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const { file, title } = files[i];
      onProgress?.(i + 1, files.length, file.name);

      try {
        const uploaded = await uploadDocument(file);
        if (!uploaded) {
          failed++;
          results.push({ name: file.name, ok: false, error: 'Upload fehlgeschlagen' });
          continue;
        }

        await createDocument({
          file_path: uploaded.path,
          file_name: uploaded.name,
          file_size: uploaded.size,
          title,
        });
        success++;
        results.push({ name: file.name, ok: true });
      } catch (err) {
        failed++;
        results.push({ name: file.name, ok: false, error: errorMessage(err, 'Unbekannter Fehler') });
      }
    }

    await fetchDocuments();
    return { success, failed, results };
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
    uploadBatch,
    checkDuplicate,
  };
}
