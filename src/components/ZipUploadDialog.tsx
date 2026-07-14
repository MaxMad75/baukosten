import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { extractZip, zipEntryToFile, ZipEntry } from '@/utils/zipExtractor';
import { computeBlobHash } from '@/utils/fileHash';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvoices } from '@/hooks/useInvoices';
import { analyzeDocumentFile, isAnalyzable, aiNeedsReview } from '@/utils/analyzeFile';
import { useContractors, matchContractorByName } from '@/hooks/useContractors';
import { useTrades, suggestTradeForCompany } from '@/hooks/useTrades';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/utils';
import { Loader2, FileText, Image, FileSpreadsheet, Check, X, Archive, AlertTriangle } from 'lucide-react';

interface ZipUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zipFile: File | null;
}

type FileStatus = 'pending' | 'uploading' | 'analyzing' | 'done' | 'error' | 'skipped';

interface FileUploadStatus {
  name: string;
  status: FileStatus;
  error?: string;
}

const getFileIcon = (name: string) => {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.pdf' || ext === '.doc' || ext === '.docx') return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return <Image className="h-4 w-4 text-blue-500 shrink-0" />;
  if (ext === '.xlsx' || ext === '.xls') return <FileSpreadsheet className="h-4 w-4 text-green-500 shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const StatusIndicator: React.FC<{ status: FileStatus; error?: string }> = ({ status, error }) => {
  switch (status) {
    case 'pending':
      return null;
    case 'uploading':
      return <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Hochladen…</span>;
    case 'analyzing':
      return <span className="text-xs text-primary whitespace-nowrap flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />KI-Analyse…</span>;
    case 'done':
      return <span className="text-xs text-green-600 whitespace-nowrap flex items-center gap-1"><Check className="h-3 w-3" />Fertig</span>;
    case 'error':
      return <span className="text-xs text-destructive whitespace-nowrap flex items-center gap-1"><X className="h-3 w-3" />{error || 'Fehler'}</span>;
    case 'skipped':
      return <span className="text-xs text-orange-600 whitespace-nowrap flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Übersprungen</span>;
    default:
      return null;
  }
};

export const ZipUploadDialog: React.FC<ZipUploadDialogProps> = ({ open, onOpenChange, zipFile }) => {
  const { uploadDocument, createDocument, fetchDocuments, checkDuplicate } = useDocuments();
  const { contractors, findOrCreateByName } = useContractors();
  const { trades } = useTrades();
  const { createInvoice } = useInvoices();
  const { toast } = useToast();

  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([]);
  const [uploadDone, setUploadDone] = useState(false);
  const [invoiceStats, setInvoiceStats] = useState({ created: 0, incomplete: 0 });

  React.useEffect(() => {
    if (!open || !zipFile) {
      setEntries([]);
      setFileStatuses([]);
      setProcessing(false);
      setUploadDone(false);
      setInvoiceStats({ created: 0, incomplete: 0 });
      return;
    }

    const doExtract = async () => {
      setExtracting(true);
      try {
        const extracted = await extractZip(zipFile);
        await Promise.all(
          extracted.map(async (entry) => {
            const blob = await entry.file.async('blob');
            entry.hash = await computeBlobHash(blob);
            const existing = checkDuplicate(entry.hash);
            if (existing) {
              entry.isDuplicate = true;
              entry.duplicateTitle = existing.title;
              entry.selected = false;
            }
          })
        );
        setEntries(extracted);
      } catch (err) {
        toast({ title: 'Fehler', description: errorMessage(err, 'ZIP konnte nicht entpackt werden'), variant: 'destructive' });
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
    setEntries((prev) => prev.map((e) => ({ ...e, selected: e.isDuplicate ? false : selected })));
  };

  const selectedEntries = entries.filter((e) => e.selected);
  const duplicateCount = entries.filter((e) => e.isDuplicate).length;

  const updateFileStatus = (name: string, status: FileStatus, error?: string) => {
    setFileStatuses((prev) => prev.map((f) => (f.name === name ? { ...f, status, error } : f)));
  };

  const handleUpload = async () => {
    setProcessing(true);
    setUploadDone(false);
    setInvoiceStats({ created: 0, incomplete: 0 });
    const initial: FileUploadStatus[] = selectedEntries.map((e) => ({ name: e.name, status: 'pending' as FileStatus }));
    setFileStatuses(initial);
    const uploadedHashes = new Set<string>();
    let successCount = 0;
    let invoicesCreated = 0;
    let invoicesIncomplete = 0;

    for (let i = 0; i < selectedEntries.length; i++) {
      const entry = selectedEntries[i];
      setProgress({ current: i + 1, total: selectedEntries.length });

      if (entry.hash && uploadedHashes.has(entry.hash)) {
        updateFileStatus(entry.name, 'skipped', 'Duplikat in dieser Sitzung');
        continue;
      }

      updateFileStatus(entry.name, 'uploading');

      try {
        const file = await zipEntryToFile(entry);
        const uploaded = await uploadDocument(file);
        if (!uploaded) {
          updateFileStatus(entry.name, 'error', 'Upload fehlgeschlagen');
          continue;
        }

        let title = entry.name;
        let description: string | undefined;
        let documentType: string | undefined;
        let contractorId: string | undefined;
        let invoiceId: string | undefined;
        let aiAnalyzed = false;
        let aiRawResult: Json | null = null;

        if (isAnalyzable(file.name)) {
          updateFileStatus(entry.name, 'analyzing');
          const ai = await analyzeDocumentFile(file);
          if (ai) {
            aiRawResult = ai as unknown as Json;
            title = ai.title || entry.name;
            description = ai.description;
            documentType = ai.document_type;
            aiAnalyzed = true;

            if (ai.document_type === 'Rechnung') {
              // Same flow as the single upload: create the invoice when the
              // extracted data is complete; otherwise the document keeps its
              // "Rechnung fehlt" badge for manual completion.
              if (ai.company_name && ai.amount && ai.invoice_date) {
                const contractor = await findOrCreateByName(ai.company_name);
                contractorId = contractor?.id;
                // Firma→Gewerk-Regel (SRS 4.1): nur eindeutige Treffer zuordnen
                const { trade } = suggestTradeForCompany(trades, ai.company_name);
                const invoice = await createInvoice({
                  amount: ai.amount,
                  invoice_date: ai.invoice_date,
                  company_name: ai.company_name,
                  invoice_number: ai.invoice_number || null,
                  description: ai.description || null,
                  kostengruppe_code: ai.kostengruppe_code || null,
                  trade_id: trade?.id || null,
                  contractor_id: contractor?.id || null,
                  // R4.1: unsichere KI-Extraktion startet als "Prüfung nötig"
                  status: aiNeedsReview(ai) ? 'review_needed' : undefined,
                  file_path: uploaded.path,
                  file_name: uploaded.name,
                  ai_extracted: true,
                  is_gross: true,
                });
                if (invoice) {
                  invoiceId = invoice.id;
                  invoicesCreated++;
                } else {
                  invoicesIncomplete++;
                }
              } else {
                invoicesIncomplete++;
                if (ai.company_name) {
                  const match = matchContractorByName(contractors, ai.company_name);
                  if (match) contractorId = match.id;
                }
              }
            } else if (ai.company_name) {
              const match = matchContractorByName(contractors, ai.company_name);
              if (match) contractorId = match.id;
            }
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
          ai_raw_result: aiRawResult,
          file_hash: entry.hash,
          invoice_id: invoiceId,
        });
        if (entry.hash) uploadedHashes.add(entry.hash);
        updateFileStatus(entry.name, 'done');
        successCount++;
      } catch (err) {
        updateFileStatus(entry.name, 'error', errorMessage(err, 'Unbekannter Fehler'));
      }
    }

    await fetchDocuments();
    setProcessing(false);
    setUploadDone(true);
    setInvoiceStats({ created: invoicesCreated, incomplete: invoicesIncomplete });

    const invoiceInfo = invoicesCreated > 0 || invoicesIncomplete > 0
      ? ` ${invoicesCreated} Rechnung${invoicesCreated === 1 ? '' : 'en'} angelegt${invoicesIncomplete > 0 ? `, ${invoicesIncomplete} unvollständig (siehe „Rechnung fehlt")` : ''}.`
      : '';
    toast({
      title: 'ZIP-Upload abgeschlossen',
      description: `${successCount} von ${selectedEntries.length} Dateien erfolgreich hochgeladen.${invoiceInfo}`,
    });
  };

  const isUploading = processing || uploadDone;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!processing) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 shrink-0" />
            <span className="truncate">ZIP-Datei hochladen</span>
          </DialogTitle>
          <DialogDescription className="truncate">
            {zipFile?.name} — Wählen Sie die Dateien aus, die hochgeladen werden sollen.
          </DialogDescription>
        </DialogHeader>

        {extracting && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">ZIP wird entpackt…</p>
          </div>
        )}

        {!extracting && !isUploading && entries.length > 0 && (
          <div className="space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{entries.length} Dateien gefunden</p>
                {duplicateCount > 0 && (
                  <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {duplicateCount} Duplikat{duplicateCount > 1 ? 'e' : ''} erkannt
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => selectAll(true)}>Alle</Button>
                <Button variant="ghost" size="sm" onClick={() => selectAll(false)}>Keine</Button>
              </div>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {entries.map((entry, idx) => (
                  <label
                    key={entry.path}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted cursor-pointer ${entry.isDuplicate ? 'opacity-60' : ''}`}
                  >
                    <Checkbox checked={entry.selected} onCheckedChange={() => toggleEntry(idx)} className="shrink-0" />
                    {getFileIcon(entry.name)}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      {entry.path !== entry.name && (
                        <p className="text-xs text-muted-foreground truncate">{entry.path}</p>
                      )}
                      {entry.isDuplicate && (
                        <p className="text-xs text-orange-600 truncate">Bereits vorhanden als „{entry.duplicateTitle}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatSize(entry.size)}</span>
                      {entry.isDuplicate ? (
                        <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 shrink-0">Duplikat</Badge>
                      ) : (() => {
                        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
                        return ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'].includes(ext);
                      })() ? (
                        <Badge variant="secondary" className="text-xs shrink-0">KI</Badge>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center gap-2">
              <p className="text-sm text-muted-foreground shrink-0">{selectedEntries.length} ausgewählt</p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                <Button onClick={handleUpload} disabled={selectedEntries.length === 0}>
                  {selectedEntries.length} Dateien hochladen
                </Button>
              </div>
            </div>
          </div>
        )}

        {isUploading && (
          <div className="space-y-4 overflow-hidden">
            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Datei {progress.current} von {progress.total}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                </div>
                <Progress value={(progress.current / progress.total) * 100} className="h-2" />
              </div>
            )}

            {uploadDone && (
              <div className="flex flex-wrap gap-2 justify-center">
                {fileStatuses.filter((f) => f.status === 'done').length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <Check className="mr-1 h-3 w-3" /> {fileStatuses.filter((f) => f.status === 'done').length} erfolgreich
                  </Badge>
                )}
                {fileStatuses.filter((f) => f.status === 'error' || f.status === 'skipped').length > 0 && (
                  <Badge variant="secondary" className="bg-red-100 text-red-800">
                    <X className="mr-1 h-3 w-3" /> {fileStatuses.filter((f) => f.status === 'error' || f.status === 'skipped').length} fehlgeschlagen
                  </Badge>
                )}
                {invoiceStats.created > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    {invoiceStats.created} Rechnung{invoiceStats.created === 1 ? '' : 'en'} angelegt
                  </Badge>
                )}
                {invoiceStats.incomplete > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    <AlertTriangle className="mr-1 h-3 w-3" /> {invoiceStats.incomplete} Rechnung{invoiceStats.incomplete === 1 ? '' : 'en'} unvollständig
                  </Badge>
                )}
              </div>
            )}

            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1">
                {fileStatuses.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm">
                    <div className="shrink-0">
                      {f.status === 'done' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : f.status === 'error' ? (
                        <X className="h-4 w-4 text-red-600" />
                      ) : f.status === 'skipped' ? (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      ) : f.status === 'pending' ? (
                        <div className="h-4 w-4 rounded-full border-2 border-muted" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                    </div>
                    {getFileIcon(f.name)}
                    <span className="truncate flex-1 min-w-0">{f.name}</span>
                    <div className="shrink-0">
                      <StatusIndicator status={f.status} error={f.error} />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {uploadDone && (
              <div className="flex justify-end">
                <Button onClick={() => onOpenChange(false)}>Schließen</Button>
              </div>
            )}
          </div>
        )}

        {!extracting && !isUploading && entries.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">Keine unterstützten Dateien im ZIP gefunden.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
