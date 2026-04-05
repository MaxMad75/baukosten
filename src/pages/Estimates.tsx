import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useDocuments, Document } from '@/hooks/useDocuments';
import { useAuth } from '@/contexts/AuthContext';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { EstimateDocumentPicker } from '@/components/EstimateDocumentPicker';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { computeFileHash } from '@/utils/fileHash';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { ExtractedEstimateData, ArchitectEstimateItem, ArchitectEstimate, EstimateVersion } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  Upload, 
  FileText, 
  Loader2, 
  Trash2,
  Calculator,
  CheckCircle2,
  Edit,
  Save,
  X,
  FolderOpen,
  AlertTriangle,
  Layers,
  Star,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Minimum text length to consider text extraction successful
const MIN_TEXT_LENGTH = 50;

// MwSt helpers
const calcNetto = (amount: number, isGross: boolean) => isGross ? amount / 1.19 : amount;
const calcBrutto = (amount: number, isGross: boolean) => isGross ? amount : amount * 1.19;

interface VatSummary {
  netto: number;
  mwst: number;
  brutto: number;
}

function computeVatSummary(items: Array<{ estimated_amount: number; is_gross: boolean }>): VatSummary {
  let netto = 0;
  let brutto = 0;
  for (const item of items) {
    const amt = Number(item.estimated_amount);
    netto += calcNetto(amt, item.is_gross);
    brutto += calcBrutto(amt, item.is_gross);
  }
  return { netto, mwst: brutto - netto, brutto };
}

function VatSummaryRows({ items, colSpan }: { items: Array<{ estimated_amount: number; is_gross: boolean }>; colSpan: number }) {
  const { netto, mwst, brutto } = computeVatSummary(items);
  const { formatAmount } = usePrivacy();
  return (
    <>
      <TableRow className="font-medium">
        <TableCell colSpan={colSpan}>Netto-Summe</TableCell>
        <TableCell className="text-right">{formatAmount(netto)}</TableCell>
        <TableCell></TableCell>
      </TableRow>
      <TableRow className="text-muted-foreground">
        <TableCell colSpan={colSpan}>+ MwSt (19%)</TableCell>
        <TableCell className="text-right">{formatAmount(mwst)}</TableCell>
        <TableCell></TableCell>
      </TableRow>
      <TableRow className="font-bold">
        <TableCell colSpan={colSpan}>Brutto-Summe</TableCell>
        <TableCell className="text-right">{formatAmount(brutto)}</TableCell>
        <TableCell></TableCell>
      </TableRow>
    </>
  );
}

interface AnalysisResult {
  is_estimate: boolean;
  confidence: string;
  reason: string;
  items: Array<{ kostengruppe_code: string; estimated_amount: number; notes: string }>;
  total: number;
}

export const Estimates: React.FC = () => {
  const { 
    versions,
    activeVersion,
    estimates, 
    allEstimates,
    estimateItems, 
    allEstimateItems,
    loading, 
    createEstimate, 
    addEstimateItems,
    setActiveVersion,
    createVersion,
    updateVersionName,
    updateEstimateItem,
    updateEstimateNotes,
    deleteEstimateItem,
    getItemsByEstimate 
  } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const { getDocumentUrl, uploadDocument, createDocument, checkDuplicate } = useDocuments();
  const { household } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = usePrivacy();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Version management
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingVersionNameValue, setEditingVersionNameValue] = useState('');
  const [isCreateVersionOpen, setIsCreateVersionOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');

  // Upload/analysis state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedEstimateData['items']>([]);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null);
  const [pendingEstimateId, setPendingEstimateId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Pre-analysis result
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showNotEstimateWarning, setShowNotEstimateWarning] = useState(false);
  const [pendingAnalysisPayload, setPendingAnalysisPayload] = useState<any>(null);

  // Edit state for inline editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    kostengruppe_code: '',
    estimated_amount: '',
    notes: '',
    is_gross: false,
  });

  // Manual estimate form state
  const [manualEstimateName, setManualEstimateName] = useState('');
  const [manualItems, setManualItems] = useState<Array<{
    kostengruppe_code: string;
    estimated_amount: string;
    notes: string;
    is_gross: boolean;
  }>>([]);
  const [newManualItem, setNewManualItem] = useState({
    kostengruppe_code: '',
    estimated_amount: '',
    notes: '',
    is_gross: false,
  });

  // Manual item form (for upload dialog)
  const [manualItem, setManualItem] = useState({
    kostengruppe_code: '',
    estimated_amount: '',
    notes: '',
    is_gross: false,
  });

  // Auto-select active version when versions load
  useEffect(() => {
    if (versions.length > 0 && !selectedVersionId) {
      const active = versions.find(v => v.is_active);
      setSelectedVersionId(active?.id || versions[0].id);
    }
  }, [versions, selectedVersionId]);

  // The currently displayed version
  const displayedVersion = versions.find(v => v.id === selectedVersionId) || activeVersion;

  // Estimates for the displayed version
  const displayedEstimates = useMemo(() => {
    if (!displayedVersion) return [];
    return allEstimates.filter(e => e.version_id === displayedVersion.id);
  }, [allEstimates, displayedVersion]);

  const resetForm = () => {
    setExtractedItems([]);
    setUploadedFile(null);
    setPendingEstimateId(null);
    setPendingFile(null);
    setManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
    setAnalysisResult(null);
    setShowNotEstimateWarning(false);
    setPendingAnalysisPayload(null);
  };

  const resetManualForm = () => {
    setManualEstimateName('');
    setManualItems([]);
    setNewManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
  };

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Call the analyze-estimate edge function
  const callAnalyzeEstimate = async (payload: { textContent?: string; fileBase64?: string; fileName: string }): Promise<AnalysisResult | null> => {
    const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-estimate', {
      body: payload,
    });

    if (functionError) throw functionError;

    if (functionData.error) {
      toast({
        title: 'AI-Analyse fehlgeschlagen',
        description: functionData.error,
        variant: 'destructive',
      });
      return null;
    }

    return functionData.data as AnalysisResult;
  };

  // Process analysis result
  const handleAnalysisResult = (result: AnalysisResult) => {
    setAnalysisResult(result);
    
    if (result.is_estimate && result.items && result.items.length > 0) {
      setExtractedItems(result.items.map(item => ({ ...item, is_gross: false })));
      toast({
        title: 'Kostenschätzung erkannt',
        description: `${result.items.length} Kostenpositionen extrahiert (Konfidenz: ${result.confidence}).`,
      });
    } else if (!result.is_estimate) {
      setShowNotEstimateWarning(true);
    }
  };

  // Process a file (PDF or image) for analysis
  const processFileForAnalysis = async (file: File | Blob, fileName: string) => {
    let textContent: string | undefined;
    let fileBase64: string | undefined;

    if (fileName.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfFile = file instanceof File ? file : new File([file], fileName);
        const text = await extractTextFromPDF(pdfFile);
        if (text && text.trim().length >= MIN_TEXT_LENGTH) {
          textContent = text;
        }
      } catch (e) {
        console.log('Text extraction failed, falling back to vision:', e);
      }
    }

    if (!textContent) {
      const buffer = await file.arrayBuffer();
      fileBase64 = arrayBufferToBase64(buffer);
    }

    return { textContent, fileBase64, fileName };
  };

  // Ensure there's a version to work with, creating one if needed
  const ensureVersion = async (): Promise<string | null> => {
    if (displayedVersion) return displayedVersion.id;
    const v = await createVersion('V1');
    if (v) {
      setSelectedVersionId(v.id);
      return v.id;
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !household) return;

    setUploading(true);
    try {
      const sanitizedName = file.name
        .replace(/\s+/g, '_')
        .replace(/,/g, '_')
        .replace(/[äÄ]/g, 'ae')
        .replace(/[öÖ]/g, 'oe')
        .replace(/[üÜ]/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${household.id}/${Date.now()}_${sanitizedName}`;
      const { error: uploadError } = await supabase.storage
        .from('estimates')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const versionId = await ensureVersion();
      if (!versionId) throw new Error('Could not determine version');

      setUploadedFile({ path: filePath, name: file.name });
      setPendingFile(file);

      const estimate = await createEstimate(filePath, file.name, versionId);
      if (!estimate) throw new Error('Could not create estimate');
      
      setPendingEstimateId(estimate.id);

      setAnalyzing(true);
      const payload = await processFileForAnalysis(file, file.name);
      setPendingAnalysisPayload(payload);
      
      const result = await callAnalyzeEstimate(payload);
      if (result) {
        handleAnalysisResult(result);
      }
    } catch (error) {
      console.error('[Estimates] Upload error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Datei konnte nicht verarbeitet werden',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const handleDocumentSelect = async (doc: Document) => {
    if (!household) return;

    setIsDocPickerOpen(false);
    setIsUploadOpen(true);
    setAnalyzing(true);

    try {
      const versionId = await ensureVersion();
      if (!versionId) throw new Error('Could not determine version');

      const signedUrl = await getDocumentUrl(doc.file_path);
      if (!signedUrl) throw new Error('Could not get document URL');

      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('Could not download document');
      
      const blob = await response.blob();

      const estimate = await createEstimate(doc.file_path, doc.file_name, versionId);
      if (!estimate) throw new Error('Could not create estimate');
      
      setPendingEstimateId(estimate.id);
      setUploadedFile({ path: doc.file_path, name: doc.file_name });

      const payload = await processFileForAnalysis(blob, doc.file_name);
      setPendingAnalysisPayload(payload);

      const result = await callAnalyzeEstimate(payload);
      if (result) {
        handleAnalysisResult(result);
      }
    } catch (error) {
      console.error('Document analysis error:', error);
      toast({
        title: 'Fehler',
        description: 'Dokument konnte nicht analysiert werden',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleForceAnalysis = () => {
    if (analysisResult && analysisResult.items && analysisResult.items.length > 0) {
      setExtractedItems(analysisResult.items.map(item => ({ ...item, is_gross: false })));
    }
    setShowNotEstimateWarning(false);
  };

  const handleSaveExtractedItems = async () => {
    if (!pendingEstimateId || extractedItems.length === 0) return;

    const success = await addEstimateItems(pendingEstimateId, extractedItems);
    if (success) {
      toast({
        title: 'Erfolg',
        description: 'Kostenschätzung wurde gespeichert.',
      });

      if (pendingFile) {
        try {
          const hash = await computeFileHash(pendingFile);
          const duplicate = checkDuplicate(hash);

          if (duplicate) {
            toast({
              title: 'Hinweis',
              description: 'Dieses Dokument existiert bereits in der Dokumentenbibliothek.',
            });
          } else {
            const uploaded = await uploadDocument(pendingFile);
            if (uploaded) {
              await createDocument({
                file_path: uploaded.path,
                file_name: uploaded.name,
                file_size: uploaded.size,
                title: pendingFile.name,
                document_type: 'Kostenschätzung',
                file_hash: hash,
              });
              toast({
                title: 'Dokument abgelegt',
                description: 'Die Kostenschätzung wurde auch in der Dokumentenbibliothek gespeichert.',
              });
            }
          }
        } catch (err) {
          console.error('Error storing estimate as document:', err);
        }
      }

      resetForm();
      setIsUploadOpen(false);
    }
  };

  const updateExtractedItem = (index: number, field: string, value: string | number | boolean) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeExtractedItem = (index: number) => {
    setExtractedItems(prev => prev.filter((_, i) => i !== index));
  };

  const addManualItemToList = () => {
    if (!manualItem.kostengruppe_code || !manualItem.estimated_amount) {
      toast({
        title: 'Fehler',
        description: 'Bitte Kostengruppe und Betrag angeben',
        variant: 'destructive',
      });
      return;
    }

    setExtractedItems(prev => [...prev, {
      kostengruppe_code: manualItem.kostengruppe_code,
      estimated_amount: parseFloat(manualItem.estimated_amount),
      notes: manualItem.notes || '',
      is_gross: manualItem.is_gross,
    }]);

    setManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
  };

  const addNewManualItem = () => {
    if (!newManualItem.kostengruppe_code || !newManualItem.estimated_amount) {
      toast({
        title: 'Fehler',
        description: 'Bitte Kostengruppe und Betrag angeben',
        variant: 'destructive',
      });
      return;
    }

    setManualItems(prev => [...prev, {
      kostengruppe_code: newManualItem.kostengruppe_code,
      estimated_amount: newManualItem.estimated_amount,
      notes: newManualItem.notes,
      is_gross: newManualItem.is_gross,
    }]);

    setNewManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
  };

  const removeManualItem = (index: number) => {
    setManualItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateManualEstimate = async () => {
    if (!household) return;

    if (manualItems.length === 0) {
      toast({
        title: 'Fehler',
        description: 'Bitte mindestens eine Kostenposition hinzufügen',
        variant: 'destructive',
      });
      return;
    }

    const versionId = await ensureVersion();
    if (!versionId) return;

    const estimate = await createEstimate('', manualEstimateName || `Manuelle Schätzung ${format(new Date(), 'dd.MM.yyyy')}`, versionId);
    if (!estimate) return;

    const success = await addEstimateItems(
      estimate.id,
      manualItems.map(item => ({
        kostengruppe_code: item.kostengruppe_code,
        estimated_amount: parseFloat(item.estimated_amount),
        notes: item.notes || undefined,
        is_gross: item.is_gross,
      }))
    );

    if (success) {
      toast({
        title: 'Erfolg',
        description: 'Kostenschätzung wurde erstellt.',
      });
      resetManualForm();
      setIsManualOpen(false);
    }
  };

  const startEditing = (item: ArchitectEstimateItem) => {
    setEditingItemId(item.id);
    setEditFormData({
      kostengruppe_code: item.kostengruppe_code,
      estimated_amount: String(item.estimated_amount),
      notes: item.notes || '',
      is_gross: item.is_gross ?? false,
    });
  };

  const cancelEditing = () => {
    setEditingItemId(null);
    setEditFormData({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
  };

  const saveEditing = async () => {
    if (!editingItemId) return;

    const success = await updateEstimateItem(editingItemId, {
      kostengruppe_code: editFormData.kostengruppe_code,
      estimated_amount: parseFloat(editFormData.estimated_amount) || 0,
      notes: editFormData.notes || null,
      is_gross: editFormData.is_gross,
    });

    if (success) {
      toast({
        title: 'Erfolg',
        description: 'Position wurde aktualisiert.',
      });
      cancelEditing();
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteId) return;
    await deleteEstimateItem(deleteId);
    setDeleteId(null);
  };

  const formatCurrency = (amount: number) => formatAmount(amount);

  // Handle creating a new version
  const handleCreateVersion = async () => {
    if (!newVersionName.trim()) return;
    const v = await createVersion(newVersionName.trim());
    if (v) {
      setSelectedVersionId(v.id);
      toast({ title: 'Erfolg', description: `Version "${v.name}" erstellt und aktiviert.` });
    }
    setNewVersionName('');
    setIsCreateVersionOpen(false);
  };

  // Handle activating a version
  const handleActivateVersion = async (versionId: string) => {
    const success = await setActiveVersion(versionId);
    if (success) {
      setSelectedVersionId(versionId);
      toast({ title: 'Erfolg', description: 'Version aktiviert.' });
    }
  };

  // Handle renaming a version
  const handleSaveVersionName = async () => {
    if (!editingVersionId || !editingVersionNameValue.trim()) return;
    await updateVersionName(editingVersionId, editingVersionNameValue.trim());
    setEditingVersionId(null);
    setEditingVersionNameValue('');
  };

  // Compute VAT summary for displayed version items
  const displayedItems = useMemo(() => {
    if (!displayedVersion) return [];
    const estIds = new Set(displayedEstimates.map(e => e.id));
    return allEstimateItems.filter(i => estIds.has(i.estimate_id));
  }, [displayedEstimates, allEstimateItems, displayedVersion]);

  const globalVat = computeVatSummary(
    displayedItems.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Kostenschätzung</h1>
            <p className="text-muted-foreground">Architekten-Kalkulation verwalten</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Upload Dialog */}
            <Dialog open={isUploadOpen} onOpenChange={(open) => { setIsUploadOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  PDF hochladen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Kostenschätzung hochladen</DialogTitle>
                  <DialogDescription>
                    Laden Sie die Kostenkalkulation Ihres Architekten als PDF hoch. Gescannte PDFs werden automatisch per OCR erkannt.
                    {displayedVersion && (
                      <span className="block mt-1 font-medium text-foreground">
                        → wird in Version „{displayedVersion.name}" angelegt
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Upload area */}
                  {extractedItems.length === 0 && !showNotEstimateWarning && (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      {uploading || analyzing ? (
                        <div className="text-center">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            {analyzing ? 'KI analysiert Dokument...' : 'Hochladen...'}
                          </p>
                          {analyzing && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Prüfe ob es eine Kostenschätzung ist und extrahiere Kosten...
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <Calculator className="h-12 w-12 text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            PDF oder Bild hier ablegen oder klicken
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Auch gescannte PDFs werden erkannt (OCR)
                          </p>
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Datei auswählen
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Not-an-estimate warning */}
                  {showNotEstimateWarning && analysisResult && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                        <div>
                          <p className="font-medium text-destructive">Keine Kostenschätzung erkannt</p>
                          <p className="text-sm text-muted-foreground mt-1">{analysisResult.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">Konfidenz: {analysisResult.confidence}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { resetForm(); }}>
                          Abbrechen
                        </Button>
                        <Button size="sm" onClick={handleForceAnalysis}>
                          Trotzdem analysieren
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Analysis result info */}
                  {analysisResult && analysisResult.is_estimate && extractedItems.length > 0 && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">Kostenschätzung erkannt</span>
                        <span className="text-muted-foreground">(Konfidenz: {analysisResult.confidence})</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{analysisResult.reason}</p>
                      <p className="mt-1">✓ {extractedItems.length} Kostenpositionen extrahiert. Bitte überprüfen und ggf. korrigieren.</p>
                    </div>
                  )}

                  {extractedItems.length > 0 && (
                    <div className="space-y-4">
                      {/* Manual add form */}
                      <div className="rounded-lg border p-4">
                        <h4 className="mb-3 font-medium">Position hinzufügen</h4>
                        <div className="grid gap-3 md:grid-cols-5">
                          <div className="md:col-span-2">
                            <KostengruppenSelect
                              value={manualItem.kostengruppe_code}
                              onValueChange={(value) => setManualItem({ ...manualItem, kostengruppe_code: value })}
                              placeholder="Kostengruppe"
                            />
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Betrag"
                            value={manualItem.estimated_amount}
                            onChange={(e) => setManualItem({ ...manualItem, estimated_amount: e.target.value })}
                          />
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="manual-item-gross"
                              checked={manualItem.is_gross}
                              onCheckedChange={(checked) => setManualItem({ ...manualItem, is_gross: !!checked })}
                            />
                            <Label htmlFor="manual-item-gross" className="text-sm whitespace-nowrap">inkl. MwSt</Label>
                          </div>
                          <Button onClick={addManualItemToList} variant="outline">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kostengruppe</TableHead>
                            <TableHead>Bezeichnung</TableHead>
                            <TableHead className="text-center">inkl. MwSt</TableHead>
                            <TableHead className="text-right">Betrag</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extractedItems.map((item, index) => {
                            const kg = getKostengruppeByCode(item.kostengruppe_code);
                            return (
                              <TableRow key={index}>
                                <TableCell>
                                  <Input
                                    value={item.kostengruppe_code}
                                    onChange={(e) => updateExtractedItem(index, 'kostengruppe_code', e.target.value)}
                                    className="w-24"
                                  />
                                </TableCell>
                                <TableCell>
                                  {kg?.name || item.notes || '-'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={item.is_gross}
                                    onCheckedChange={(checked) => updateExtractedItem(index, 'is_gross', !!checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={item.estimated_amount}
                                    onChange={(e) => updateExtractedItem(index, 'estimated_amount', parseFloat(e.target.value) || 0)}
                                    className="w-32 text-right"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => removeExtractedItem(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <VatSummaryRows items={extractedItems} colSpan={3} />
                        </TableBody>
                      </Table>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { resetForm(); setIsUploadOpen(false); }}>
                          Abbrechen
                        </Button>
                        <Button onClick={handleSaveExtractedItems}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Speichern
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Document Picker Button */}
            <Button variant="outline" onClick={() => setIsDocPickerOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Aus Dokumenten
            </Button>

            {/* Manual Entry Dialog */}
            <Dialog open={isManualOpen} onOpenChange={(open) => { setIsManualOpen(open); if (!open) resetManualForm(); }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Manuell erfassen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Kostenschätzung manuell erfassen</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie eine neue Kostenschätzung und fügen Sie Positionen hinzu.
                    {displayedVersion && (
                      <span className="block mt-1 font-medium text-foreground">
                        → wird in Version „{displayedVersion.name}" angelegt
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Bezeichnung</Label>
                    <Input
                      value={manualEstimateName}
                      onChange={(e) => setManualEstimateName(e.target.value)}
                      placeholder="z.B. Kostenschätzung Architekt Müller"
                    />
                  </div>

                  {/* Add item form */}
                  <div className="rounded-lg border p-4">
                    <h4 className="mb-3 font-medium">Position hinzufügen</h4>
                    <div className="grid gap-3 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <KostengruppenSelect
                          value={newManualItem.kostengruppe_code}
                          onValueChange={(value) => setNewManualItem({ ...newManualItem, kostengruppe_code: value })}
                          placeholder="Kostengruppe"
                        />
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Betrag (EUR)"
                        value={newManualItem.estimated_amount}
                        onChange={(e) => setNewManualItem({ ...newManualItem, estimated_amount: e.target.value })}
                      />
                      <Input
                        placeholder="Notiz (optional)"
                        value={newManualItem.notes}
                        onChange={(e) => setNewManualItem({ ...newManualItem, notes: e.target.value })}
                      />
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="new-manual-gross"
                          checked={newManualItem.is_gross}
                          onCheckedChange={(checked) => setNewManualItem({ ...newManualItem, is_gross: !!checked })}
                        />
                        <Label htmlFor="new-manual-gross" className="text-sm whitespace-nowrap">inkl. MwSt</Label>
                      </div>
                      <Button onClick={addNewManualItem} variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Items list */}
                  {manualItems.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kostengruppe</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead>Notiz</TableHead>
                          <TableHead className="text-center">inkl. MwSt</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualItems.map((item, index) => {
                          const kg = getKostengruppeByCode(item.kostengruppe_code);
                          return (
                            <TableRow key={index}>
                              <TableCell className="font-mono">{item.kostengruppe_code}</TableCell>
                              <TableCell>{kg?.name || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={item.is_gross}
                                  onCheckedChange={(checked) => {
                                    setManualItems(prev => prev.map((it, i) => i === index ? { ...it, is_gross: !!checked } : it));
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(parseFloat(item.estimated_amount) || 0)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => removeManualItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <VatSummaryRows
                          items={manualItems.map(i => ({ estimated_amount: parseFloat(i.estimated_amount) || 0, is_gross: i.is_gross }))}
                          colSpan={4}
                        />
                      </TableBody>
                    </Table>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { resetManualForm(); setIsManualOpen(false); }}>
                      Abbrechen
                    </Button>
                    <Button onClick={handleCreateManualEstimate} disabled={manualItems.length === 0}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Schätzung speichern
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Version Selector */}
        {versions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Versionen</CardTitle>
                </div>
                <Dialog open={isCreateVersionOpen} onOpenChange={setIsCreateVersionOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Neue Version
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Neue Version erstellen</DialogTitle>
                      <DialogDescription>
                        Eine neue Version wird erstellt und als aktive Version gesetzt. Alle Uploads und manuellen Schätzungen werden dieser Version zugeordnet.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Versionsname</Label>
                        <Input
                          value={newVersionName}
                          onChange={(e) => setNewVersionName(e.target.value)}
                          placeholder={`V${(versions.length || 0) + 1}`}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateVersion()}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateVersionOpen(false)}>Abbrechen</Button>
                      <Button onClick={handleCreateVersion}>Erstellen</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center gap-1">
                    {editingVersionId === v.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingVersionNameValue}
                          onChange={(e) => setEditingVersionNameValue(e.target.value)}
                          className="h-8 w-32 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveVersionName();
                            if (e.key === 'Escape') setEditingVersionId(null);
                          }}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={handleSaveVersionName} className="h-8 w-8 p-0">
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingVersionId(null)} className="h-8 w-8 p-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant={selectedVersionId === v.id ? 'default' : 'outline'}
                        onClick={() => setSelectedVersionId(v.id)}
                        className="gap-2"
                      >
                        {v.name}
                        {v.is_active && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            <Star className="h-3 w-3 mr-0.5" />
                            aktiv
                          </Badge>
                        )}
                      </Button>
                    )}
                    {selectedVersionId === v.id && editingVersionId !== v.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setEditingVersionId(v.id);
                          setEditingVersionNameValue(v.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {displayedVersion && !displayedVersion.is_active && (
                <div className="mt-3 flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    Diese Version ist nicht aktiv. Nur die aktive Version fließt in den Soll-Ist-Vergleich ein.
                  </p>
                  <Button size="sm" onClick={() => handleActivateVersion(displayedVersion.id)}>
                    <Star className="mr-2 h-4 w-4" />
                    Als aktiv setzen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Gesamtschätzung{displayedVersion ? ` — ${displayedVersion.name}` : ''}</CardTitle>
            <CardDescription>
              {displayedVersion?.is_active
                ? 'Aktive Version — fließt in den Soll-Ist-Vergleich ein'
                : displayedVersion
                  ? 'Nicht-aktive Version (nur zur Ansicht)'
                  : 'Summe aller geschätzten Kosten'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Netto-Summe</span>
                <span className="text-lg font-medium">{formatCurrency(globalVat.netto)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">+ MwSt (19%)</span>
                <span className="text-lg font-medium">{formatCurrency(globalVat.mwst)}</span>
              </div>
              <div className="flex justify-between items-baseline border-t pt-1">
                <span className="text-sm font-semibold">Brutto-Summe</span>
                <span className="text-3xl font-bold text-primary">{formatCurrency(globalVat.brutto)}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {displayedItems.length} Kostenpositionen in {displayedEstimates.length} Schätzblock(en)
              {versions.length > 1 && ` — ${versions.length} Versionen gesamt`}
            </p>
          </CardContent>
        </Card>

        {/* Estimates List for displayed version */}
        {displayedEstimates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calculator className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">
                {versions.length === 0
                  ? 'Keine Kostenschätzungen vorhanden'
                  : `Keine Schätzungen in ${displayedVersion?.name || 'dieser Version'}`}
              </h3>
              <p className="text-muted-foreground">Laden Sie die Kalkulation Ihres Architekten hoch oder erfassen Sie sie manuell.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Schätzungen — {displayedVersion?.name || 'Aktuell'}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {displayedEstimates.map((estimate) => {
                  const items = getItemsByEstimate(estimate.id);
                  const estVat = computeVatSummary(
                    items.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))
                  );
                  
                  return (
                    <AccordionItem key={estimate.id} value={estimate.id}>
                      <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div className="text-left">
                              <p className="font-medium">{estimate.file_name || 'Kostenschätzung'}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(estimate.uploaded_at), 'dd.MM.yyyy', { locale: de })}
                                {estimate.notes && <span className="ml-2">— {estimate.notes}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(estVat.brutto)}</p>
                            <p className="text-sm text-muted-foreground">{items.length} Positionen</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Code</TableHead>
                              <TableHead>Kostengruppe</TableHead>
                              <TableHead>Notizen</TableHead>
                              <TableHead className="text-center">inkl. MwSt</TableHead>
                              <TableHead className="text-right">Betrag</TableHead>
                              <TableHead className="w-24">Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item) => {
                              const kg = getKostengruppeByCode(item.kostengruppe_code);
                              const isEditing = editingItemId === item.id;

                              if (isEditing) {
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell>
                                      <Input
                                        value={editFormData.kostengruppe_code}
                                        onChange={(e) => setEditFormData({ ...editFormData, kostengruppe_code: e.target.value })}
                                        className="w-24"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <KostengruppenSelect
                                        value={editFormData.kostengruppe_code}
                                        onValueChange={(value) => setEditFormData({ ...editFormData, kostengruppe_code: value })}
                                        placeholder="Kostengruppe"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={editFormData.notes}
                                        onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                                        placeholder="Notiz"
                                      />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={editFormData.is_gross}
                                        onCheckedChange={(checked) => setEditFormData({ ...editFormData, is_gross: !!checked })}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editFormData.estimated_amount}
                                        onChange={(e) => setEditFormData({ ...editFormData, estimated_amount: e.target.value })}
                                        className="w-32 text-right"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" onClick={saveEditing}>
                                          <Save className="h-4 w-4 text-primary" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={cancelEditing}>
                                          <X className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              }

                              return (
                                <TableRow key={item.id}>
                                  <TableCell className="font-mono">{item.kostengruppe_code}</TableCell>
                                  <TableCell>{kg?.name || '-'}</TableCell>
                                  <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                                  <TableCell className="text-center">
                                    {(item.is_gross) ? (
                                      <span className="text-xs text-muted-foreground">brutto</span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">netto</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(Number(item.estimated_amount))}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => startEditing(item)}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive"
                                        onClick={() => setDeleteId(item.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            <VatSummaryRows
                              items={items.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))}
                              colSpan={4}
                            />
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Position löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Document Picker Dialog */}
        <EstimateDocumentPicker
          open={isDocPickerOpen}
          onOpenChange={setIsDocPickerOpen}
          onSelect={handleDocumentSelect}
          loading={analyzing}
        />
      </div>
    </Layout>
  );
};

export default Estimates;
