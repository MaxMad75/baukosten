import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useContractors, matchContractorByName } from '@/hooks/useContractors';
import { useInvoices } from '@/hooks/useInvoices';
import { useOffers } from '@/hooks/useOffers';
import { buildAnalysisBody, analyzeDocumentFile, isAnalyzable, AiResult } from '@/utils/analyzeFile';
import { InvoiceFieldsSection, InvoiceForm, emptyInvoiceForm } from '@/components/documents/InvoiceFieldsSection';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Loader2, Trash2, Edit, Search, FileText, Upload, Download, FolderOpen, Sparkles, ExternalLink, RotateCw, Receipt, FileCheck, Eye
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

const invoiceFormFromAi = (ai: AiResult): InvoiceForm => ({
  company_name: ai.company_name || '',
  invoice_number: ai.invoice_number || '',
  amount: ai.amount != null ? String(ai.amount) : '',
  invoice_date: ai.invoice_date || '',
  kostengruppe_code: ai.kostengruppe_code || '',
});

export const Documents: React.FC = () => {
  const { documents, loading, uploadDocument, createDocument, updateDocument, deleteDocument, getDocumentUrl, checkDuplicate } = useDocuments();
  const { contractors, findOrCreateByName, fetchContractors } = useContractors();
  const { invoices, createInvoice, deleteInvoice, fetchInvoices } = useInvoices();
  const { offers, createOffer } = useOffers();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
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
  const [invoiceAiLoading, setInvoiceAiLoading] = useState(false);
  // Inline preview (PDF/images)
  const [previewDoc, setPreviewDoc] = useState<{ fileName: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const openPreview = async (filePath: string, fileName: string) => {
    setPreviewDoc({ fileName });
    setPreviewUrl(null);
    const url = await getDocumentUrl(filePath);
    if (url) {
      setPreviewUrl(url);
    } else {
      setPreviewDoc(null);
      toast({ title: 'Fehler', description: 'Vorschau konnte nicht geladen werden', variant: 'destructive' });
    }
  };
  // Store full AI result for invoice creation
  const [pendingAiResult, setPendingAiResult] = useState<AiResult | null>(null);
  // Editable invoice fields (prefilled by AI, always correctable by the user)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);

  const resetForm = () => { setFormData(emptyForm); setInvoiceForm(emptyInvoiceForm); setUploadedFile(null); setPendingFileHash(null); setDuplicateWarning(null); setPendingAiResult(null); };

  /**
   * Find or create contractor by company name. Returns contractor ID or null.
   */
  const findOrCreateContractor = async (companyName: string): Promise<string | null> => {
    const contractor = await findOrCreateByName(companyName);
    return contractor?.id || null;
  };

  /** The linked invoice is the master record for invoice-typed documents. */
  const getLinkedInvoice = (doc: Document) =>
    doc.invoice_id ? invoices.find((i) => i.id === doc.invoice_id) || null : null;

  /**
   * Second AI pass, dedicated to invoice extraction: fills the EMPTY invoice
   * fields from the uploaded file. User-entered values are never overwritten.
   */
  const runInvoiceAiPass = async () => {
    const path = editingDoc?.file_path || uploadedFile?.path;
    const name = editingDoc?.file_name || uploadedFile?.name;
    if (!path || !name) return;

    setInvoiceAiLoading(true);
    try {
      const url = await getDocumentUrl(path);
      if (!url) throw new Error('Datei nicht verfügbar');
      const resp = await fetch(url);
      const blob = await resp.blob();
      const body = await buildAnalysisBody(new File([blob], name));

      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-invoice', { body });
      if (functionError) throw new Error(functionError.message);
      if (!functionData?.data) throw new Error('Keine Daten von der KI erhalten');

      const ai = functionData.data as {
        company_name?: string | null; invoice_number?: string | null;
        amount?: number | null; invoice_date?: string | null; kostengruppe_code?: string | null;
      };
      setInvoiceForm((prev) => ({
        company_name: prev.company_name || ai.company_name || '',
        invoice_number: prev.invoice_number || ai.invoice_number || '',
        amount: prev.amount || (ai.amount != null ? String(ai.amount) : ''),
        invoice_date: prev.invoice_date || ai.invoice_date || '',
        kostengruppe_code: prev.kostengruppe_code || ai.kostengruppe_code || '',
      }));
      toast({ title: 'KI-Ergänzung abgeschlossen', description: 'Leere Felder wurden ausgefüllt — bitte prüfen.' });
    } catch (err) {
      toast({
        title: 'KI-Ergänzung fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    }
    setInvoiceAiLoading(false);
  };

  /**
   * Validate the editable invoice fields. Returns an error message or null.
   */
  const getInvoiceFormError = (form: InvoiceForm): string | null => {
    if (!form.company_name.trim()) return 'Firma fehlt';
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) return 'Betrag fehlt oder ist ungültig';
    if (!form.invoice_date) return 'Rechnungsdatum fehlt';
    return null;
  };

  /**
   * Create an invoice record from the (user-verified) invoice form and return its ID.
   */
  const createInvoiceRecord = async (
    form: InvoiceForm,
    filePath: string,
    fileName: string,
    description: string | null,
    aiExtracted: boolean
  ): Promise<string | null> => {
    const invoice = await createInvoice({
      amount: parseFloat(form.amount),
      invoice_date: form.invoice_date,
      company_name: form.company_name.trim(),
      invoice_number: form.invoice_number.trim() || null,
      description: description || null,
      kostengruppe_code: form.kostengruppe_code || null,
      file_path: filePath,
      file_name: fileName,
      ai_extracted: aiExtracted,
      is_gross: true,
    });

    return invoice?.id || null;
  };

  /**
   * Manually create a structured offer from a document's metadata.
   */
  const createOfferFromDocument = async (doc: Document) => {
    if (offers.some(o => o.document_id === doc.id)) {
      toast({ title: 'Hinweis', description: 'Für dieses Dokument existiert bereits ein strukturiertes Angebot.' });
      return;
    }
    const companyName = getContractorName(doc.contractor_id) || doc.title;
    const result = await createOffer({
      company_name: companyName,
      title: doc.title,
      document_id: doc.id,
      contractor_id: doc.contractor_id || undefined,
    });
    if (result) {
      navigate('/offers?items=' + result.id);
    }
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
      if (isAnalyzable(file.name)) {
        setAnalyzing(true);
        const ai = await analyzeDocumentFile(file);
        if (ai) {
          setPendingAiResult(ai);
          setFormData({
            title: ai.title || file.name,
            document_type: ai.document_type || '',
            description: ai.description || '',
            contractor_id: '',
          });
          setInvoiceForm(invoiceFormFromAi(ai));

          if (ai.company_name) {
            const match = matchContractorByName(contractors, ai.company_name);
            if (match) setFormData((prev) => ({ ...prev, contractor_id: match.id }));
          }

          toast({ title: 'KI-Analyse abgeschlossen', description: 'Bitte überprüfen Sie die erkannten Daten.' });
        } else {
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

    // If classified as Rechnung, validate the invoice fields and create the invoice.
    // Works with or without AI — the user can fill in the fields manually.
    if (isInvoice) {
      const error = getInvoiceFormError(invoiceForm);
      if (error) {
        toast({ title: 'Rechnungsdaten unvollständig', description: `${error}. Bitte ergänzen Sie die Rechnungsfelder.`, variant: 'destructive' });
        return;
      }

      if (!contractorId) {
        contractorId = await findOrCreateContractor(invoiceForm.company_name.trim());
      }

      invoiceId = await createInvoiceRecord(
        invoiceForm,
        uploadedFile.path,
        uploadedFile.name,
        formData.description || null,
        !!pendingAiResult
      );

      if (!invoiceId) return; // createInvoice already showed an error toast
      toast({ title: 'Rechnung angelegt', description: 'Die Rechnung ist jetzt in der Rechnungsverwaltung verfügbar.' });
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

  const openEdit = (doc: Document, prefillInvoice?: InvoiceForm) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      document_type: doc.document_type || '',
      description: doc.description || '',
      contractor_id: doc.contractor_id || '',
    });
    setInvoiceForm(prefillInvoice || { ...emptyInvoiceForm, company_name: getContractorName(doc.contractor_id) || '' });
    setPendingAiResult(null);
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingDoc || !formData.title) return;

    let contractorId = formData.contractor_id || null;
    let invoiceId = editingDoc.invoice_id || null;

    // Retroactively create the invoice if the document is (now) typed as Rechnung
    // but has no linked invoice yet (e.g. ZIP upload or earlier failed detection).
    if (formData.document_type === 'Rechnung' && !invoiceId) {
      const error = getInvoiceFormError(invoiceForm);
      if (error) {
        toast({ title: 'Rechnungsdaten unvollständig', description: `${error}. Bitte ergänzen Sie die Rechnungsfelder.`, variant: 'destructive' });
        return;
      }

      if (!contractorId) {
        contractorId = await findOrCreateContractor(invoiceForm.company_name.trim());
      }

      invoiceId = await createInvoiceRecord(
        invoiceForm,
        editingDoc.file_path,
        editingDoc.file_name,
        formData.description || null,
        false
      );

      if (!invoiceId) return;
      toast({ title: 'Rechnung angelegt', description: 'Die Rechnung ist jetzt in der Rechnungsverwaltung verfügbar.' });
    }

    await updateDocument(editingDoc.id, {
      title: formData.title,
      document_type: formData.document_type || null,
      description: formData.description || null,
      contractor_id: contractorId,
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
    });
    setIsEditOpen(false);
    setEditingDoc(null);
    resetForm();
  };

  const handleDelete = async (alsoDeleteInvoice: boolean) => {
    if (!deleteTarget) return;
    const linkedInvoice = getLinkedInvoice(deleteTarget);

    if (alsoDeleteInvoice && deleteTarget.invoice_id) {
      await deleteInvoice(deleteTarget.invoice_id);
    }

    // Keep the storage file if a surviving invoice still references the same path
    const keepFile = !alsoDeleteInvoice && !!linkedInvoice && linkedInvoice.file_path === deleteTarget.file_path;
    await deleteDocument(deleteTarget.id, { keepFile });
    setDeleteTarget(null);
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
      const resp = await fetch(url);
      const blob = await resp.blob();
      const body = await buildAnalysisBody(new File([blob], doc.file_name));

      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-document', { body });

      if (functionError) throw new Error(functionError.message);
      if (!functionData?.data) throw new Error('Keine Daten von KI erhalten');

      const ai: AiResult = functionData.data;
      let contractorId = doc.contractor_id;
      const linkedInvoice = getLinkedInvoice(doc);

      // The linked invoice is the master for the company — align the document
      // with it instead of letting a re-analysis introduce a diverging name.
      if (linkedInvoice) {
        contractorId = await findOrCreateContractor(linkedInvoice.company_name);
      } else if (ai.company_name) {
        contractorId = await findOrCreateContractor(ai.company_name);
      }

      // If classified as Rechnung and no invoice linked yet, create one
      let invoiceId = doc.invoice_id || null;
      let needsCompletion = false;
      if (ai.document_type === 'Rechnung' && !invoiceId) {
        const form = invoiceFormFromAi(ai);
        if (!getInvoiceFormError(form)) {
          invoiceId = await createInvoiceRecord(form, doc.file_path, doc.file_name, ai.description || null, true);
          if (invoiceId) {
            toast({ title: 'Rechnung erkannt', description: 'Rechnung wurde automatisch in der Rechnungsverwaltung angelegt.' });
          }
        } else {
          needsCompletion = true;
        }
      }

      const updates = {
        title: ai.title || doc.title,
        document_type: ai.document_type || doc.document_type,
        description: ai.description || doc.description,
        contractor_id: contractorId,
        ai_analyzed: true,
        ...(invoiceId ? { invoice_id: invoiceId } : {}),
      };
      await updateDocument(doc.id, updates);

      if (needsCompletion) {
        // Open the edit dialog prefilled with what the AI found so the user
        // can complete the missing fields instead of the invoice silently missing.
        openEdit({ ...doc, ...updates }, invoiceFormFromAi(ai));
        toast({
          title: 'Rechnung erkannt – Daten unvollständig',
          description: 'Bitte ergänzen Sie die fehlenden Rechnungsfelder und speichern Sie.',
        });
      } else {
        toast({ title: 'KI-Analyse abgeschlossen', description: `"${ai.title || doc.title}" wurde analysiert.` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Analyse fehlgeschlagen', description: message, variant: 'destructive' });
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

  // Invoice fields are shown when the doc is typed "Rechnung" and no invoice is linked yet
  const showInvoiceFields = formData.document_type === 'Rechnung' && !editingDoc?.invoice_id;

  // Live duplicate check: same company + invoice number, or same company + amount + date
  const duplicateInvoice = useMemo(() => {
    if (!showInvoiceFields) return null;
    const name = invoiceForm.company_name.trim().toLowerCase();
    if (!name) return null;
    const num = invoiceForm.invoice_number.trim().toLowerCase();
    const amount = parseFloat(invoiceForm.amount);
    return invoices.find((inv) => {
      if (inv.company_name.trim().toLowerCase() !== name) return false;
      if (num && (inv.invoice_number || '').trim().toLowerCase() === num) return true;
      return !isNaN(amount)
        && Math.abs(Number(inv.amount) - amount) < 0.01
        && !!invoiceForm.invoice_date
        && inv.invoice_date === invoiceForm.invoice_date;
    }) || null;
  }, [showInvoiceFields, invoiceForm, invoices]);

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
      {/* For invoices the contractor is always derived from the invoice's Firma */}
      {formData.document_type !== 'Rechnung' && (
        <div className="space-y-2">
          <Label>Firma zuordnen</Label>
          <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
            <SelectTrigger><SelectValue placeholder="Firma wählen (optional)" /></SelectTrigger>
            <SelectContent>
              {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="col-span-2 space-y-2">
        <Label>Beschreibung</Label>
        <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Kurze Beschreibung des Dokuments" rows={3} />
      </div>
      {/* Editable invoice fields */}
      {showInvoiceFields && (
        <InvoiceFieldsSection
          form={invoiceForm}
          onChange={setInvoiceForm}
          duplicate={duplicateInvoice}
          showAiButton={!!(editingDoc?.file_path || uploadedFile?.path)}
          aiLoading={invoiceAiLoading}
          onAiPass={runInvoiceAiPass}
        />
      )}
      {formData.document_type === 'Rechnung' && editingDoc?.invoice_id && (
        <div className="col-span-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <div className="flex items-center gap-2 font-medium">
            <Receipt className="h-4 w-4" />
            Rechnung ist verknüpft
          </div>
          <p className="mt-1 text-xs">Betrag, Status und Zahlungsaufteilung bearbeiten Sie in der Rechnungsverwaltung.</p>
        </div>
      )}
      {formData.document_type === 'Angebot' && (
        <div className="col-span-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <div className="flex items-center gap-2 font-medium">
            <FileCheck className="h-4 w-4" />
            Angebot erkannt – kann nach dem Speichern als strukturiertes Angebot angelegt werden
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
                            {doc.invoice_id && (() => {
                              const inv = getLinkedInvoice(doc);
                              const isPaid = inv?.status === 'paid';
                              return (
                                <Badge variant="outline" className={`text-xs ${isPaid ? 'border-green-400 text-green-700' : 'border-orange-300 text-orange-700'}`}>
                                  <Receipt className="mr-1 h-3 w-3" />
                                  {inv
                                    ? `${Number(inv.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}${isPaid ? ' · bezahlt' : ''}`
                                    : 'Rechnung'}
                                </Badge>
                              );
                            })()}
                            {doc.document_type === 'Rechnung' && !doc.invoice_id && (
                              <button onClick={() => openEdit(doc)} title="Rechnungsdaten ergänzen">
                                <Badge variant="outline" className="text-xs border-destructive text-destructive cursor-pointer">
                                  <Receipt className="mr-1 h-3 w-3" />Rechnung fehlt
                                </Badge>
                              </button>
                            )}
                            {offers.some(o => o.document_id === doc.id) && (
                              <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700">
                                <FileCheck className="mr-1 h-3 w-3" />Angebot
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
                      <TableCell className="hidden lg:table-cell">
                        {getLinkedInvoice(doc)?.company_name || getContractorName(doc.contractor_id) || '–'}
                      </TableCell>
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
                          {doc.document_type === 'Angebot' && !offers.some(o => o.document_id === doc.id) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => createOfferFromDocument(doc)}>
                                    <FileCheck className="h-4 w-4 text-yellow-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Angebot strukturieren</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openPreview(doc.file_path, doc.file_name)} title="Vorschau">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Herunterladen">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(doc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <div className="flex items-center justify-between gap-2">
              {editingDoc ? (
                <Button variant="outline" size="sm" onClick={() => openPreview(editingDoc.file_path, editingDoc.file_name)}>
                  <Eye className="mr-2 h-4 w-4" /> Vorschau
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { resetForm(); setIsEditOpen(false); }}>Abbrechen</Button>
                <Button onClick={handleUpdate}>Speichern</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.invoice_id
                ? 'Dieses Dokument ist mit einer Rechnung verknüpft. Sie können nur das Dokument löschen (die Rechnung und ihre Zahlungen bleiben erhalten) oder beides zusammen entfernen.'
                : 'Das Dokument wird unwiderruflich gelöscht.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            {deleteTarget?.invoice_id ? (
              <>
                <AlertDialogAction onClick={() => handleDelete(false)}>Nur Dokument löschen</AlertDialogAction>
                <AlertDialogAction onClick={() => handleDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Dokument + Rechnung löschen
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => handleDelete(false)}>Löschen</AlertDialogAction>
            )}
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

      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(o) => { if (!o) { setPreviewDoc(null); setPreviewUrl(null); } }}
        fileName={previewDoc?.fileName || null}
        url={previewUrl}
      />
    </Layout>
  );
};

export default Documents;
