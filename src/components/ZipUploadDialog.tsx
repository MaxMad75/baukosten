import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { extractZip, zipEntryToFile, ZipEntry } from '@/utils/zipExtractor';
import { useDocuments } from '@/hooks/useDocuments';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { supabase } from '@/integrations/supabase/client';
import { useContractors } from '@/hooks/useContractors';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Image, FileSpreadsheet, Check, X, Archive } from 'lucide-react';

interface ZipUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zipFile: File | null;
}

const getFileIcon = (name: string) => {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.pdf' || ext === '.doc' || ext === '.docx') return <FileText className="h-4 w-4 text-red-500" />;
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return <Image className="h-4 w-4 text-blue-500" />;
  if (ext === '.xlsx' || ext === '.xls') return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ZipUploadDialog: React.FC<ZipUploadDialogProps> = ({ open, onOpenChange, zipFile }) => {
  const { uploadDocument, createDocument, fetchDocuments } = useDocuments();
  const { contractors } = useContractors();
  const { toast } = useToast();

  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null);

  // Extract ZIP when dialog opens with a file
  React.useEffect(() => {
    if (!open || !zipFile) {
      setEntries([]);
      setResults(null);
      setProcessing(false);
      return;
    }

    const doExtract = async () => {
      setExtracting(true);
      try {
        const extracted = await extractZip(zipFile);
        setEntries(extracted);
      } catch (err: any) {
        toast({ title: 'Fehler', description: err.message || 'ZIP konnte nicht entpackt werden', variant: 'destructive' });
        onOpenChange(false);
      }
      setExtracting(false);
    };
    doExtract();
  }, [open, zipFile]);

  const toggleEntry = (index: number) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, selected: !e.selected } : e)));
  };

  const selectAll = (selected: boolean) => {
    setEntries((prev) => prev.map((e) => ({ ...e, selected })));
  };

  const selectedEntries = entries.filter((e) => e.selected);

  const handleUpload = async () => {
    setProcessing(true);
    const uploadResults: { name: string; ok: boolean; error?: string }[] = [];

    for (let i = 0; i < selectedEntries.length; i++) {
      const entry = selectedEntries[i];
      setProgress({ current: i + 1, total: selectedEntries.length, fileName: entry.name });

      try {
        const file = await zipEntryToFile(entry);
        const uploaded = await uploadDocument(file);
        if (!uploaded) {
          uploadResults.push({ name: entry.name, ok: false, error: 'Upload fehlgeschlagen' });
          continue;
        }

        let title = entry.name;
        let description: string | undefined;
        let documentType: string | undefined;
        let contractorId: string | undefined;
        let aiAnalyzed = false;

        // AI analysis for PDFs
        if (file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const pdfText = await extractTextFromPDF(file);
            const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-document', {
              body: { textContent: pdfText, fileName: file.name }
            });

            if (!functionError && functionData?.data) {
              const ai = functionData.data;
              title = ai.title || entry.name;
              description = ai.description;
              documentType = ai.document_type;
              aiAnalyzed = true;

              if (ai.company_name) {
                const match = contractors.find(
                  (c) => c.company_name.toLowerCase().includes(ai.company_name.toLowerCase()) ||
                    ai.company_name.toLowerCase().includes(c.company_name.toLowerCase())
                );
                if (match) contractorId = match.id;
              }
            }
          } catch {
            // AI failed, continue with defaults
          }
        }

        await createDocument({
          file_path: uploaded.path,
          file_name: uploaded.name,
          file_size: uploaded.size,
          title,
          description,
          document_type: documentType,
          contractor_id: contractorId,
          ai_analyzed: aiAnalyzed,
        });
        uploadResults.push({ name: entry.name, ok: true });
      } catch (err: any) {
        uploadResults.push({ name: entry.name, ok: false, error: err?.message || 'Unbekannter Fehler' });
      }
    }

    await fetchDocuments();
    setResults(uploadResults);
    setProcessing(false);

    const successCount = uploadResults.filter((r) => r.ok).length;
    toast({
      title: 'ZIP-Upload abgeschlossen',
      description: `${successCount} von ${uploadResults.length} Dateien erfolgreich hochgeladen.`,
    });
  };

  const successCount = results?.filter((r) => r.ok).length || 0;
  const failedCount = results?.filter((r) => !r.ok).length || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!processing) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            ZIP-Datei hochladen
          </DialogTitle>
          <DialogDescription>
            {zipFile?.name} — Wählen Sie die Dateien aus, die hochgeladen werden sollen.
          </DialogDescription>
        </DialogHeader>

        {extracting && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">ZIP wird entpackt…</p>
          </div>
        )}

        {!extracting && !processing && !results && entries.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{entries.length} Dateien gefunden</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll(true)}>Alle auswählen</Button>
                <Button variant="ghost" size="sm" onClick={() => selectAll(false)}>Keine auswählen</Button>
              </div>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {entries.map((entry, idx) => (
                  <label
                    key={entry.path}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted cursor-pointer"
                  >
                    <Checkbox checked={entry.selected} onCheckedChange={() => toggleEntry(idx)} />
                    {getFileIcon(entry.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      {entry.path !== entry.name && (
                        <p className="text-xs text-muted-foreground truncate">{entry.path}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatSize(entry.size)}</span>
                    {entry.name.toLowerCase().endsWith('.pdf') && (
                      <Badge variant="secondary" className="text-xs">KI</Badge>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{selectedEntries.length} ausgewählt</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                <Button onClick={handleUpload} disabled={selectedEntries.length === 0}>
                  {selectedEntries.length} Dateien hochladen
                </Button>
              </div>
            </div>
          </div>
        )}

        {processing && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm font-medium">
                Datei {progress.current} von {progress.total}
              </p>
              <p className="text-xs text-muted-foreground truncate">{progress.fileName}</p>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        )}

        {results && (
          <div className="space-y-4">
            <div className="flex gap-4 justify-center">
              {successCount > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <Check className="mr-1 h-3 w-3" /> {successCount} erfolgreich
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800">
                  <X className="mr-1 h-3 w-3" /> {failedCount} fehlgeschlagen
                </Badge>
              )}
            </div>

            <ScrollArea className="h-48 rounded-md border">
              <div className="p-2 space-y-1">
                {results.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {r.ok ? (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span className="truncate flex-1">{r.name}</span>
                    {r.error && <span className="text-xs text-destructive">{r.error}</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Schließen</Button>
            </div>
          </div>
        )}

        {!extracting && !processing && !results && entries.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">Keine unterstützten Dateien im ZIP gefunden.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
