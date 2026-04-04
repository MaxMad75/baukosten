import React, { useState, useRef } from 'react';
import { computeFileHash } from '@/utils/fileHash';
import { Layout } from '@/components/Layout';
import { ZipUploadDialog } from '@/components/ZipUploadDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useDocuments, Document } from '@/hooks/useDocuments';
import { useContractors } from '@/hooks/useContractors';
import { useInvoices } from '@/hooks/useInvoices';
import { useOffers } from '@/hooks/useOffers';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { extractTextFromExcel } from '@/utils/excelExtractor';
import { fileToBase64, fetchFileAsBase64 } from '@/utils/imageToBase64';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Loader2, Trash2, Edit, Search, FileText, Upload, Download, FolderOpen, Sparkles, ExternalLink, RotateCw, Receipt, FileCheck
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const DOCUMENT_TYPES = ['Vertrag', 'Genehmigung', 'Angebot', 'Zeichnung', 'Rechnung', 'Protokoll', 'Sonstiges'];

const typeColors: Record<string, string> = {
  Vertrag: 'bg-blue-100 text-blue-800',
  Genehmigung: 'bg-green-100 text-green-800',
  Angebot: 'bg-yellow-100 text-yellow-800',
  Zeichnung: 'bg-purple-100 text-purple-800',
  Rechnung: 'bg-orange-100 text-orange-800',
  Protokoll: 'bg-cyan-100 text-cyan-800',
  Sonstiges: 'bg-muted text-muted-foreground',
};

const emptyForm = { title: '', document_type: '', description: '', contractor_id: '' };

interface AiResult {
  title?: string;
  document_type?: string;
  description?: string;
  company_name?: string | null;
  invoice_number?: string | null;
  amount?: number | null;
  invoice_date?: string | null;
  kostengruppe_code?: string | null;
}

export const Documents: React.FC = () => {
  const { documents, loading, uploadDocument, createDocument, updateDocument, deleteDocument, getDocumentUrl, checkDuplicate } = useDocuments();
  const { contractors, createContractor, fetchContractors } = useContractors();
  const { createInvoice, fetchInvoices } = useInvoices();
  const { offers, createOffer } = useOffers();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string; size: number } | null>(null);
  const [pendingFileHash, setPendingFileHash] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingTitle: string; file: File } | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isZipOpen, setIsZipOpen] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  // Store full AI result for invoice creation
  const [pendingAiResult, setPendingAiResult] = useState<AiResult | null>(null);

  const resetForm = () => { setFormData(emptyForm); setUploadedFile(null); setPendingFileHash(null); setDuplicateWarning(null); setPendingAiResult(null); };

  /**
   * Find or create contractor by company name.
   * Returns contractor ID or null.
   */
  const findOrCreateContractor = async (companyName: string): Promise<string | null> => {
    const match = contractors.find(
      (c) => c.company_name.toLowerCase().includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(c.company_name.toLowerCase())
    );
    if (match) return match.id;

    // Auto-create contractor
    const newContractor = await createContractor({ company_name: companyName });
    if (newContractor) {
      toast({ title: 'Firma angelegt', description: `"${companyName}" wurde automatisch als Firma erstellt.` });
      return newContractor.id;
    }
    return null;
  };

  /**
   * Create an invoice record from AI-extracted data and link it to the document.
   */
  const createInvoiceFromDocument = async (
    ai: AiResult,
    filePath: string,
    fileName: string,
    contractorId: string | null
  ): Promise<string | null> => {
    if (!ai.amount || !ai.invoice_date || !ai.company_name) return null;

    const invoice = await createInvoice({
      amount: ai.amount,
      invoice_date: ai.invoice_date,
      company_name: ai.company_name,
      invoice_number: ai.invoice_number || null,
      description: ai.description || null,
      kostengruppe_code: ai.kostengruppe_code || null,
      file_path: filePath,
      file_name: fileName,
      ai_extracted: true,
      is_gross: true,
    });

    return invoice?.id || null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Handle ZIP files separately
    if (file.name.toLowerCase().endsWith('.zip')) {
      setZipFile(file);
      setIsZipOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      // Compute hash and check for duplicates
      const hash = await computeFileHash(file);
      const existing = checkDuplicate(hash);
      if (existing) {
        setDuplicateWarning({ existingTitle: existing.title, file });
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setPendingFileHash(hash);

      const result = await uploadDocument(file);
      if (!result) { setUploading(false); return; }
      setUploadedFile(result);

      // Try AI analysis for supported types
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const analyzableExts = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];
      if (analyzableExts.includes(ext)) {
        setAnalyzing(true);
        try {
          let body: Record<string, string> = { fileName: file.name };
          if (ext === '.pdf') {
            body.textContent = await extractTextFromPDF(file);
          } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            body.imageBase64 = await fileToBase64(file);
          } else if (['.xlsx', '.xls'].includes(ext)) {
            body.textContent = await extractTextFromExcel(file);
          }

          const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-document', { body });

          if (!functionError && functionData?.data) {
            const ai: AiResult = functionData.data;
            setPendingAiResult(ai);
            setFormData({
              title: ai.title || file.name,
              document_type: ai.document_type || '',
              description: ai.description || '',
              contractor_id: '',
            });

            if (ai.company_name) {
              const match = contractors.find(
                (c) => c.company_name.toLowerCase().includes(ai.company_name!.toLowerCase()) ||
                  ai.company_name!.toLowerCase().includes(c.company_name.toLowerCase())
              );
              if (match) setFormData((prev) => ({ ...prev, contractor_id: match.id }));
            }

            toast({ title: 'KI-Analyse abgeschlossen', description: 'Bitte überprüfen Sie die erkannten Daten.' });
          } else {
            setFormData((prev) => ({ ...prev, title: file.name }));
          }
        } catch {
          setFormData((prev) => ({ ...prev, title: file.name }));
        }
        setAnalyzing(false);
      } else {
        setFormData((prev) => ({ ...prev, title: file.name }));
      }
    } catch {
      toast({ title: 'Fehler', description: 'Datei konnte nicht hochgeladen werden', variant: 'destructive' });
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    if (!uploadedFile || !formData.title) return;

    const isInvoice = formData.document_type === 'Rechnung';
    let contractorId = formData.contractor_id || null;
    let invoiceId: string | null = null;

    // If classified as Rechnung, handle contractor + invoice creation
    if (isInvoice && pendingAiResult) {
      // Find or create contractor from company name
      if (pendingAiResult.company_name && !contractorId) {
        contractorId = await findOrCreateContractor(pendingAiResult.company_name);
      }

      // Create invoice record
      invoiceId = await createInvoiceFromDocument(
        pendingAiResult,
        uploadedFile.path,
        uploadedFile.name,
        contractorId
      );

      if (invoiceId) {
        toast({ title: 'Rechnung erkannt', description: 'Rechnung wurde automatisch in der Rechnungsverwaltung angelegt.' });
      }
    }

    await createDocument({
      file_path: uploadedFile.path,
      file_name: uploadedFile.name,
      file_size: uploadedFile.size,
      title: formData.title,
      document_type: formData.document_type || undefined,
      description: formData.description || undefined,
      contractor_id: contractorId || undefined,
      ai_analyzed: analyzing || !!formData.description,
      file_hash: pendingFileHash || undefined,
      invoice_id: invoiceId || undefined,
    });
    resetForm();
    setIsUploadOpen(false);
  };

  const handleDuplicateForceUpload = async () => {
    if (!duplicateWarning) return;
    setDuplicateWarning(null);
    const file = duplicateWarning.file;
    setUploading(true);
    try {
      const hash = await computeFileHash(file);
      setPendingFileHash(hash);
      const result = await uploadDocument(file);
      if (!result) { setUploading(false); return; }
      setUploadedFile(result);
      setFormData((prev) => ({ ...prev, title: file.name }));
    } catch {
      toast({ title: 'Fehler', description: 'Datei konnte nicht hochgeladen werden', variant: 'destructive' });
    }
    setUploading(false);
  };

  const openEdit = (doc: Document) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      document_type: doc.document_type || '',
      description: doc.description || '',
      contractor_id: doc.contractor_id || '',
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingDoc || !formData.title) return;
    await updateDocument(editingDoc.id, {
      title: formData.title,
      document_type: formData.document_type || null,
      description: formData.description || null,
      contractor_id: formData.contractor_id || null,
    });
    setIsEditOpen(false);
    setEditingDoc(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteDocument(deleteId);
    setDeleteId(null);
  };

  const handleDownload = async (doc: Document) => {
    const url = await getDocumentUrl(doc.file_path);
    if (url) window.open(url, '_blank');
  };

  const handleAnalyzeDocument = async (doc: Document) => {
    setAnalyzingDocId(doc.id);
    try {
      const url = await getDocumentUrl(doc.file_path);
      if (!url) throw new Error('URL nicht verfügbar');

      const ext = doc.file_name.substring(doc.file_name.lastIndexOf('.')).toLowerCase();
      let body: Record<string, string> = { fileName: doc.file_name };

      if (ext === '.pdf') {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const file = new File([blob], doc.file_name, { type: 'application/pdf' });
        body.textContent = await extractTextFromPDF(file);
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        body.imageBase64 = await fetchFileAsBase64(url);
      } else if (['.xlsx', '.xls'].includes(ext)) {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const file = new File([blob], doc.file_name);
        body.textContent = await extractTextFromExcel(file);
      } else {
        body.textContent = `Dateiname: ${doc.file_name}`;
      }

      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-document', { body });

      if (functionError) throw new Error(functionError.message);
      if (!functionData?.data) throw new Error('Keine Daten von KI erhalten');

      const ai: AiResult = functionData.data;
      let contractorId = doc.contractor_id;

      // Find or create contractor
      if (ai.company_name) {
        contractorId = await findOrCreateContractor(ai.company_name);
      }

      // If classified as Rechnung and no invoice linked yet, create one
      let invoiceId = (doc as any).invoice_id || null;
      if (ai.document_type === 'Rechnung' && !invoiceId) {
        invoiceId = await createInvoiceFromDocument(ai, doc.file_path, doc.file_name, contractorId);
        if (invoiceId) {
          toast({ title: 'Rechnung erkannt', description: 'Rechnung wurde automatisch in der Rechnungsverwaltung angelegt.' });
        }
      }

      await updateDocument(doc.id, {
        title: ai.title || doc.title,
        document_type: ai.document_type || doc.document_type,
        description: ai.description || doc.description,
        contractor_id: contractorId,
        ai_analyzed: true,
        ...(invoiceId ? { invoice_id: invoiceId } : {}),
      } as any);

      toast({ title: 'KI-Analyse abgeschlossen', description: `"${ai.title || doc.title}" wurde analysiert.` });
    } catch (err: any) {
      toast({ title: 'Analyse fehlgeschlagen', description: err?.message || 'Unbekannter Fehler', variant: 'destructive' });
    }
    setAnalyzingDocId(null);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '–';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filtered = documents.filter((d) => {
    const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || d.document_type === filterType;
    return matchSearch && matchType;
  });

  const getContractorName = (id: string | null) => {
    if (!id) return null;
    return contractors.find((c) => c.id === id)?.company_name || null;
  };

  const documentFormFields = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="col-span-2 space-y-2">
        <Label>Titel *</Label>
        <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Dokumenttitel" />
      </div>
      <div className="space-y-2">
        <Label>Dokumenttyp</Label>
        <Select value={formData.document_type} onValueChange={(v) => setFormData({ ...formData, document_type: v })}>
          <SelectTrigger><SelectValue placeholder="Typ wählen" /></SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Firma zuordnen</Label>
        <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
          <SelectTrigger><SelectValue placeholder="Firma wählen (optional)" /></SelectTrigger>
          <SelectContent>
            {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Beschreibung</Label>
        <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Kurze Beschreibung des Dokuments" rows={3} />
      </div>
      {/* Invoice hint */}
      {formData.document_type === 'Rechnung' && pendingAiResult?.amount && (
        <div className="col-span-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <div className="flex items-center gap-2 font-medium">
            <Receipt className="h-4 w-4" />
            Rechnung erkannt – wird automatisch in die Rechnungsverwaltung übernommen
          </div>
          <div className="mt-1 text-xs">
            {pendingAiResult.company_name && <span>Firma: {pendingAiResult.company_name} · </span>}
            Betrag: {pendingAiResult.amount?.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            {pendingAiResult.invoice_date && <span> · Datum: {pendingAiResult.invoice_date}</span>}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dokumente</h1>
            <p className="text-muted-foreground">Alle Baudokumente an einem Ort</p>
          </div>
          <Dialog open={isUploadOpen} onOpenChange={(o) => { setIsUploadOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Upload className="mr-2 h-4 w-4" />Dokument hochladen</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Dokument hochladen</DialogTitle>
                <DialogDescription>
                  Laden Sie ein Dokument hoch. PDFs werden automatisch per KI analysiert. Rechnungen werden automatisch in die Rechnungsverwaltung übernommen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!uploadedFile && (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8">
                    <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.zip" onChange={handleFileUpload} className="hidden" />
                    {uploading || analyzing ? (
                      <div className="text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          {analyzing ? (
                            <span className="flex items-center justify-center gap-1">
                              <Sparkles className="h-4 w-4" /> KI analysiert Dokument...
                            </span>
                          ) : 'Hochladen...'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <FolderOpen className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">PDF, Word, Excel, Bild oder ZIP hierher ziehen</p>
                        <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>Datei auswählen</Button>
                      </>
                    )}
                  </div>
                )}

                {uploadedFile && (
                  <>
                    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      ✓ Datei hochgeladen: {uploadedFile.name} ({formatFileSize(uploadedFile.size)})
                    </div>
                    <div className="space-y-4">
                      {documentFormFields}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { resetForm(); setIsUploadOpen(false); }}>Abbrechen</Button>
                        <Button onClick={handleCreate}>Dokument speichern</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder="Suche nach Titel, Beschreibung oder Dateiname..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Alle Typen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Keine Dokumente vorhanden</p>
              <p className="text-muted-foreground">Laden Sie Ihr erstes Dokument hoch.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead className="hidden md:table-cell">Typ</TableHead>
                    <TableHead className="hidden lg:table-cell">Firma</TableHead>
                    <TableHead className="hidden md:table-cell">Größe</TableHead>
                    <TableHead className="hidden lg:table-cell">Datum</TableHead>
                    <TableHead className="w-32">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{doc.title}</span>
                            {doc.ai_analyzed ? (
                              <Sparkles className="h-3 w-3 text-amber-500" />
                            ) : (
                              <Sparkles className="h-3 w-3 text-muted-foreground/40" />
                            )}
                            {(doc as any).invoice_id && (
                              <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                                <Receipt className="mr-1 h-3 w-3" />Rechnung
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{doc.file_name}</div>
                          {doc.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{doc.description}</div>}
                          <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                            {doc.document_type && <Badge variant="secondary" className={typeColors[doc.document_type] || ''}>{doc.document_type}</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {doc.document_type ? (
                          <Badge variant="secondary" className={typeColors[doc.document_type] || ''}>{doc.document_type}</Badge>
                        ) : '–'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{getContractorName(doc.contractor_id) || '–'}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {format(new Date(doc.created_at!), 'dd.MM.yyyy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleAnalyzeDocument(doc)}
                                  disabled={analyzingDocId === doc.id}
                                >
                                  {analyzingDocId === doc.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : doc.ai_analyzed ? (
                                    <RotateCw className="h-4 w-4 text-amber-500" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {doc.ai_analyzed ? 'Erneut analysieren' : 'KI-Analyse starten'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Herunterladen">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(doc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingDoc(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dokument bearbeiten</DialogTitle>
            <DialogDescription>Aktualisieren Sie die Dokumentdetails.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {documentFormFields}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { resetForm(); setIsEditOpen(false); }}>Abbrechen</Button>
              <Button onClick={handleUpdate}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Dokument wird unwiderruflich gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Warning */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={(o) => { if (!o) setDuplicateWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplikat erkannt</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Datei existiert bereits als „{duplicateWarning?.existingTitle}". Möchten Sie sie trotzdem hochladen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateForceUpload}>Trotzdem hochladen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ZipUploadDialog
        open={isZipOpen}
        onOpenChange={(o) => { setIsZipOpen(o); if (!o) setZipFile(null); }}
        zipFile={zipFile}
      />
    </Layout>
  );
};

export default Documents;
