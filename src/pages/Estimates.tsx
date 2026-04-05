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
import { ExtractedEstimateData, ArchitectEstimateItem, ArchitectEstimate, EstimateVersion, EstimateBlock } from '@/lib/types';
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
  Package,
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
    allBlocks,
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
    getItemsByEstimate,
    getItemsByBlock,
    createBlock,
    addBlockItems,
    deleteBlock,
    copyBlocksToVersion,
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
  const [copyBlockIds, setCopyBlockIds] = useState<string[]>([]);
  const [pendingNewVersionId, setPendingNewVersionId] = useState<string | null>(null);
  const [isCopyBlocksOpen, setIsCopyBlocksOpen] = useState(false);

  // Block management
  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false);
  const [newBlockLabel, setNewBlockLabel] = useState('');
  const [newBlockType, setNewBlockType] = useState<'imported' | 'manual'>('manual');
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);

  // Manual block items
  const [isManualBlockItemsOpen, setIsManualBlockItemsOpen] = useState(false);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [manualBlockItems, setManualBlockItems] = useState<Array<{
    kostengruppe_code: string;
    estimated_amount: string;
    notes: string;
    is_gross: boolean;
  }>>([]);
  const [newBlockItem, setNewBlockItem] = useState({
    kostengruppe_code: '',
    estimated_amount: '',
    notes: '',
    is_gross: false,
  });

  // Upload/analysis state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedEstimateData['items']>([]);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null);
  const [pendingEstimateId, setPendingEstimateId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingImportBlockId, setPendingImportBlockId] = useState<string | null>(null);

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

  // Manual estimate form state (for upload dialog)
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

  // Blocks for the displayed version
  const displayedBlocks = useMemo(() => {
    if (!displayedVersion) return [];
    return allBlocks.filter(b => b.version_id === displayedVersion.id);
  }, [allBlocks, displayedVersion]);

  // Legacy estimates for the displayed version (those without block linkage)
  const displayedEstimates = useMemo(() => {
    if (!displayedVersion) return [];
    return allEstimates.filter(e => e.version_id === displayedVersion.id);
  }, [allEstimates, displayedVersion]);

  // Items for the displayed version (both block-linked and legacy)
  const displayedItems = useMemo(() => {
    if (!displayedVersion) return [];
    const blockIds = new Set(displayedBlocks.map(b => b.id));
    const estIds = new Set(displayedEstimates.map(e => e.id));
    return allEstimateItems.filter(i =>
      (i.block_id && blockIds.has(i.block_id)) ||
      (!i.block_id && estIds.has(i.estimate_id))
    );
  }, [displayedBlocks, displayedEstimates, allEstimateItems, displayedVersion]);

  // Legacy estimates that have items NOT linked to any block
  const legacyEstimatesWithItems = useMemo(() => {
    return displayedEstimates.filter(est => {
      const items = allEstimateItems.filter(i => i.estimate_id === est.id && !i.block_id);
      return items.length > 0;
    });
  }, [displayedEstimates, allEstimateItems]);

  // Previous version (for block copying)
  const previousVersion = useMemo(() => {
    if (!displayedVersion) return null;
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
    const idx = sorted.findIndex(v => v.id === displayedVersion.id);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [versions, displayedVersion]);

  const resetForm = () => {
    setExtractedItems([]);
    setUploadedFile(null);
    setPendingEstimateId(null);
    setPendingFile(null);
    setPendingImportBlockId(null);
    setManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
    setAnalysisResult(null);
    setShowNotEstimateWarning(false);
    setPendingAnalysisPayload(null);
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

      // Create an imported block for the file
      const block = await createBlock(versionId, 'imported', file.name, filePath, file.name);

      // Also create legacy estimate record
      const estimate = await createEstimate(filePath, file.name, versionId);
      if (!estimate) throw new Error('Could not create estimate');
      
      setPendingEstimateId(estimate.id);
      if (block) setPendingImportBlockId(block.id);

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

      // Create imported block
      const block = await createBlock(versionId, 'imported', doc.file_name, doc.file_path, doc.file_name);

      const estimate = await createEstimate(doc.file_path, doc.file_name, versionId);
      if (!estimate) throw new Error('Could not create estimate');
      
      setPendingEstimateId(estimate.id);
      if (block) setPendingImportBlockId(block.id);
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

    // If we have a block, link items to it; otherwise legacy path
    if (pendingImportBlockId) {
      const success = await addBlockItems(pendingImportBlockId, pendingEstimateId, extractedItems);
      if (success) {
        // Mark block as processed
        await supabase.from('estimate_blocks').update({ processed: true }).eq('id', pendingImportBlockId);
        // Also mark legacy estimate
        await supabase.from('architect_estimates').update({ processed: true }).eq('id', pendingEstimateId);

        toast({ title: 'Erfolg', description: 'Kostenschätzung wurde gespeichert.' });
      }
    } else {
      const success = await addEstimateItems(pendingEstimateId, extractedItems);
      if (success) {
        toast({ title: 'Erfolg', description: 'Kostenschätzung wurde gespeichert.' });
      }
    }

    // Also store as document if possible
    if (pendingFile) {
      try {
        const hash = await computeFileHash(pendingFile);
        const duplicate = checkDuplicate(hash);
        if (duplicate) {
          toast({ title: 'Hinweis', description: 'Dieses Dokument existiert bereits in der Dokumentenbibliothek.' });
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
            toast({ title: 'Dokument abgelegt', description: 'Die Kostenschätzung wurde auch in der Dokumentenbibliothek gespeichert.' });
          }
        }
      } catch (err) {
        console.error('Error storing estimate as document:', err);
      }
    }

    resetForm();
    setIsUploadOpen(false);
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
      toast({ title: 'Fehler', description: 'Bitte Kostengruppe und Betrag angeben', variant: 'destructive' });
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

  // ── Block handlers ──

  const handleCreateManualBlock = async () => {
    if (!newBlockLabel.trim()) {
      toast({ title: 'Fehler', description: 'Bitte einen Namen eingeben', variant: 'destructive' });
      return;
    }

    const versionId = await ensureVersion();
    if (!versionId) return;

    const block = await createBlock(versionId, 'manual', newBlockLabel.trim());
    if (block) {
      toast({ title: 'Erfolg', description: `Block „${block.label}" erstellt.` });
      setNewBlockLabel('');
      setIsAddBlockOpen(false);

      // Open manual items dialog for the new block
      setPendingBlockId(block.id);
      setManualBlockItems([]);
      setIsManualBlockItemsOpen(true);
    }
  };

  const handleCreateImportedBlock = () => {
    setIsAddBlockOpen(false);
    setIsUploadOpen(true);
  };

  const addNewBlockItem = () => {
    if (!newBlockItem.kostengruppe_code || !newBlockItem.estimated_amount) {
      toast({ title: 'Fehler', description: 'Bitte Kostengruppe und Betrag angeben', variant: 'destructive' });
      return;
    }

    setManualBlockItems(prev => [...prev, {
      kostengruppe_code: newBlockItem.kostengruppe_code,
      estimated_amount: newBlockItem.estimated_amount,
      notes: newBlockItem.notes,
      is_gross: newBlockItem.is_gross,
    }]);
    setNewBlockItem({ kostengruppe_code: '', estimated_amount: '', notes: '', is_gross: false });
  };

  const handleSaveBlockItems = async () => {
    if (!pendingBlockId || manualBlockItems.length === 0) return;

    const versionId = displayedVersion?.id;
    if (!versionId || !household) return;

    // Need an estimate record for the FK
    let est = allEstimates.find(e => e.version_id === versionId);
    if (!est) {
      const created = await createEstimate('', 'Block-Container', versionId);
      if (!created) return;
      est = created;
    }

    const success = await addBlockItems(
      pendingBlockId,
      est.id,
      manualBlockItems.map(item => ({
        kostengruppe_code: item.kostengruppe_code,
        estimated_amount: parseFloat(item.estimated_amount),
        notes: item.notes || undefined,
        is_gross: item.is_gross,
      }))
    );

    if (success) {
      toast({ title: 'Erfolg', description: 'Positionen wurden gespeichert.' });
      setManualBlockItems([]);
      setPendingBlockId(null);
      setIsManualBlockItemsOpen(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (!deleteBlockId) return;
    const success = await deleteBlock(deleteBlockId);
    if (success) {
      toast({ title: 'Erfolg', description: 'Block wurde gelöscht.' });
    }
    setDeleteBlockId(null);
  };

  // ── Version handlers ──

  const handleCreateVersion = async () => {
    const name = newVersionName.trim() || `V${(versions.length || 0) + 1}`;
    const v = await createVersion(name);
    if (v) {
      setSelectedVersionId(v.id);

      // Check if the previous version has manual blocks to copy
      const prevVersion = versions.length > 0
        ? [...versions].sort((a, b) => b.version_number - a.version_number)[0]
        : null;
      if (prevVersion) {
        const prevManualBlocks = allBlocks.filter(b => b.version_id === prevVersion.id && b.block_type === 'manual');
        if (prevManualBlocks.length > 0) {
          setPendingNewVersionId(v.id);
          setCopyBlockIds(prevManualBlocks.map(b => b.id));
          setIsCopyBlocksOpen(true);
        } else {
          toast({ title: 'Erfolg', description: `Version „${v.name}" erstellt und aktiviert.` });
        }
      } else {
        toast({ title: 'Erfolg', description: `Version „${v.name}" erstellt und aktiviert.` });
      }
    }
    setNewVersionName('');
    setIsCreateVersionOpen(false);
  };

  const handleCopyBlocks = async () => {
    if (!pendingNewVersionId) return;

    const prevVersion = versions.length > 1
      ? [...versions].sort((a, b) => b.version_number - a.version_number)[1]
      : null;
    if (!prevVersion) return;

    if (copyBlockIds.length > 0) {
      await copyBlocksToVersion(prevVersion.id, pendingNewVersionId, copyBlockIds);
      toast({ title: 'Erfolg', description: `${copyBlockIds.length} Block(e) übernommen.` });
    }

    setPendingNewVersionId(null);
    setCopyBlockIds([]);
    setIsCopyBlocksOpen(false);
  };

  const handleActivateVersion = async (versionId: string) => {
    const success = await setActiveVersion(versionId);
    if (success) {
      setSelectedVersionId(versionId);
      toast({ title: 'Erfolg', description: 'Version aktiviert.' });
    }
  };

  const handleSaveVersionName = async () => {
    if (!editingVersionId || !editingVersionNameValue.trim()) return;
    await updateVersionName(editingVersionId, editingVersionNameValue.trim());
    setEditingVersionId(null);
    setEditingVersionNameValue('');
  };

  // ── Edit handlers ──

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
      toast({ title: 'Erfolg', description: 'Position wurde aktualisiert.' });
      cancelEditing();
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteId) return;
    await deleteEstimateItem(deleteId);
    setDeleteId(null);
  };

  const formatCurrency = (amount: number) => formatAmount(amount);

  // VAT summary
  const globalVat = computeVatSummary(
    displayedItems.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))
  );

  // Render item table (shared between blocks and legacy estimates)
  const renderItemTable = (items: ArchitectEstimateItem[]) => (
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
                  <Input value={editFormData.kostengruppe_code} onChange={(e) => setEditFormData({ ...editFormData, kostengruppe_code: e.target.value })} className="w-24" />
                </TableCell>
                <TableCell>
                  <KostengruppenSelect value={editFormData.kostengruppe_code} onValueChange={(value) => setEditFormData({ ...editFormData, kostengruppe_code: value })} placeholder="Kostengruppe" />
                </TableCell>
                <TableCell>
                  <Input value={editFormData.notes} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} placeholder="Notiz" />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={editFormData.is_gross} onCheckedChange={(checked) => setEditFormData({ ...editFormData, is_gross: !!checked })} />
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" step="0.01" value={editFormData.estimated_amount} onChange={(e) => setEditFormData({ ...editFormData, estimated_amount: e.target.value })} className="w-32 text-right" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={saveEditing}><Save className="h-4 w-4 text-primary" /></Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}><X className="h-4 w-4 text-muted-foreground" /></Button>
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
                <span className="text-xs text-muted-foreground">{item.is_gross ? 'brutto' : 'netto'}</span>
              </TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(Number(item.estimated_amount))}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEditing(item)}><Edit className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        <VatSummaryRows items={items.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))} colSpan={4} />
      </TableBody>
    </Table>
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
            {/* Add Block */}
            <Dialog open={isAddBlockOpen} onOpenChange={setIsAddBlockOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Block hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neuen Kostenblock hinzufügen</DialogTitle>
                  <DialogDescription>
                    Wählen Sie, ob Sie eine PDF importieren oder manuell Kosten erfassen möchten.
                    {displayedVersion && (
                      <span className="block mt-1 font-medium text-foreground">
                        → wird in Version „{displayedVersion.name}" angelegt
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Bezeichnung</Label>
                    <Input
                      value={newBlockLabel}
                      onChange={(e) => setNewBlockLabel(e.target.value)}
                      placeholder="z.B. Grundstück, Architekt KS, Bodengutachten"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="outline" onClick={handleCreateImportedBlock}>
                      <Upload className="mr-2 h-4 w-4" />
                      PDF importieren
                    </Button>
                    <Button className="flex-1" onClick={handleCreateManualBlock} disabled={!newBlockLabel.trim()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Manuell erfassen
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Document Picker Button */}
            <Button variant="outline" onClick={() => setIsDocPickerOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Aus Dokumenten
            </Button>
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
                        Eine neue Version wird erstellt und als aktive Version gesetzt. Manuelle Blöcke können optional aus der vorherigen Version übernommen werden.
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
                        <Button size="sm" variant="ghost" onClick={handleSaveVersionName} className="h-8 w-8 p-0"><Save className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingVersionId(null)} className="h-8 w-8 p-0"><X className="h-3 w-3" /></Button>
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
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditingVersionId(v.id); setEditingVersionNameValue(v.name); }}>
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
              {displayedItems.length} Kostenpositionen in {displayedBlocks.length} Block(en)
              {legacyEstimatesWithItems.length > 0 && ` + ${legacyEstimatesWithItems.length} Schätzung(en)`}
              {versions.length > 1 && ` — ${versions.length} Versionen gesamt`}
            </p>
          </CardContent>
        </Card>

        {/* Blocks + Legacy Estimates */}
        {displayedBlocks.length === 0 && legacyEstimatesWithItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calculator className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">
                {versions.length === 0
                  ? 'Keine Kostenschätzungen vorhanden'
                  : `Keine Blöcke in ${displayedVersion?.name || 'dieser Version'}`}
              </h3>
              <p className="text-muted-foreground">Fügen Sie einen Kostenblock hinzu (PDF oder manuell).</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Kostenblöcke — {displayedVersion?.name || 'Aktuell'}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {/* Render blocks */}
                {displayedBlocks.map((block) => {
                  const items = getItemsByBlock(block.id);
                  const blockVat = computeVatSummary(
                    items.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))
                  );
                  
                  return (
                    <AccordionItem key={block.id} value={`block-${block.id}`}>
                      <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                          <div className="flex items-center gap-3">
                            <Package className="h-5 w-5 text-muted-foreground" />
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{block.label}</p>
                                <Badge variant={block.block_type === 'imported' ? 'default' : 'secondary'} className="text-xs">
                                  {block.block_type === 'imported' ? 'Import' : 'Manuell'}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(block.created_at), 'dd.MM.yyyy', { locale: de })}
                                {block.notes && <span className="ml-2">— {block.notes}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(blockVat.brutto)}</p>
                              <p className="text-sm text-muted-foreground">{items.length} Positionen</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive h-8 w-8 p-0"
                              onClick={(e) => { e.stopPropagation(); setDeleteBlockId(block.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {items.length > 0 ? renderItemTable(items) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">Keine Positionen in diesem Block.</p>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => {
                            setPendingBlockId(block.id);
                            setManualBlockItems([]);
                            setIsManualBlockItemsOpen(true);
                          }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Position hinzufügen
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}

                {/* Render legacy estimates (items without block_id) */}
                {legacyEstimatesWithItems.map((estimate) => {
                  const items = allEstimateItems.filter(i => i.estimate_id === estimate.id && !i.block_id);
                  const estVat = computeVatSummary(
                    items.map(i => ({ estimated_amount: Number(i.estimated_amount), is_gross: i.is_gross ?? false }))
                  );
                  
                  return (
                    <AccordionItem key={estimate.id} value={`legacy-${estimate.id}`}>
                      <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{estimate.file_name || 'Kostenschätzung'}</p>
                                <Badge variant="outline" className="text-xs">Legacy</Badge>
                              </div>
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
                        {renderItemTable(items)}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Upload Dialog (for imported blocks) */}
        <Dialog open={isUploadOpen} onOpenChange={(open) => { setIsUploadOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Kostenschätzung importieren</DialogTitle>
              <DialogDescription>
                Laden Sie eine PDF-Datei hoch. Gescannte PDFs werden automatisch per OCR erkannt.
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
                  <input type="file" ref={fileInputRef} accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" />
                  {uploading || analyzing ? (
                    <div className="text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                      <p className="mt-2 text-sm text-muted-foreground">{analyzing ? 'KI analysiert Dokument...' : 'Hochladen...'}</p>
                      {analyzing && <p className="mt-1 text-xs text-muted-foreground">Prüfe ob es eine Kostenschätzung ist und extrahiere Kosten...</p>}
                    </div>
                  ) : (
                    <>
                      <Calculator className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">PDF oder Bild hier ablegen oder klicken</p>
                      <p className="text-xs text-muted-foreground">Auch gescannte PDFs werden erkannt (OCR)</p>
                      <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>Datei auswählen</Button>
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
                    <Button variant="outline" size="sm" onClick={() => resetForm()}>Abbrechen</Button>
                    <Button size="sm" onClick={handleForceAnalysis}>Trotzdem analysieren</Button>
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
                        <KostengruppenSelect value={manualItem.kostengruppe_code} onValueChange={(value) => setManualItem({ ...manualItem, kostengruppe_code: value })} placeholder="Kostengruppe" />
                      </div>
                      <Input type="number" step="0.01" placeholder="Betrag" value={manualItem.estimated_amount} onChange={(e) => setManualItem({ ...manualItem, estimated_amount: e.target.value })} />
                      <div className="flex items-center gap-2">
                        <Checkbox id="manual-item-gross" checked={manualItem.is_gross} onCheckedChange={(checked) => setManualItem({ ...manualItem, is_gross: !!checked })} />
                        <Label htmlFor="manual-item-gross" className="text-sm whitespace-nowrap">inkl. MwSt</Label>
                      </div>
                      <Button onClick={addManualItemToList} variant="outline"><Plus className="h-4 w-4" /></Button>
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
                              <Input value={item.kostengruppe_code} onChange={(e) => updateExtractedItem(index, 'kostengruppe_code', e.target.value)} className="w-24" />
                            </TableCell>
                            <TableCell>{kg?.name || item.notes || '-'}</TableCell>
                            <TableCell className="text-center">
                              <Checkbox checked={item.is_gross} onCheckedChange={(checked) => updateExtractedItem(index, 'is_gross', !!checked)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input type="number" step="0.01" value={item.estimated_amount} onChange={(e) => updateExtractedItem(index, 'estimated_amount', parseFloat(e.target.value) || 0)} className="w-32 text-right" />
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeExtractedItem(index)}><Trash2 className="h-4 w-4" /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <VatSummaryRows items={extractedItems} colSpan={3} />
                    </TableBody>
                  </Table>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { resetForm(); setIsUploadOpen(false); }}>Abbrechen</Button>
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

        {/* Manual Block Items Dialog */}
        <Dialog open={isManualBlockItemsOpen} onOpenChange={(open) => { setIsManualBlockItemsOpen(open); if (!open) { setPendingBlockId(null); setManualBlockItems([]); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Kostenpositionen erfassen</DialogTitle>
              <DialogDescription>Fügen Sie Positionen zum Block hinzu.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="mb-3 font-medium">Position hinzufügen</h4>
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <KostengruppenSelect value={newBlockItem.kostengruppe_code} onValueChange={(value) => setNewBlockItem({ ...newBlockItem, kostengruppe_code: value })} placeholder="Kostengruppe" />
                  </div>
                  <Input type="number" step="0.01" placeholder="Betrag" value={newBlockItem.estimated_amount} onChange={(e) => setNewBlockItem({ ...newBlockItem, estimated_amount: e.target.value })} />
                  <Input placeholder="Notiz" value={newBlockItem.notes} onChange={(e) => setNewBlockItem({ ...newBlockItem, notes: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <Checkbox id="block-item-gross" checked={newBlockItem.is_gross} onCheckedChange={(checked) => setNewBlockItem({ ...newBlockItem, is_gross: !!checked })} />
                    <Label htmlFor="block-item-gross" className="text-sm whitespace-nowrap">inkl. MwSt</Label>
                  </div>
                  <Button onClick={addNewBlockItem} variant="outline"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              {manualBlockItems.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostengruppe</TableHead>
                      <TableHead>Notiz</TableHead>
                      <TableHead className="text-center">inkl. MwSt</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualBlockItems.map((item, index) => {
                      const kg = getKostengruppeByCode(item.kostengruppe_code);
                      return (
                        <TableRow key={index}>
                          <TableCell>{item.kostengruppe_code} — {kg?.name || '-'}</TableCell>
                          <TableCell>{item.notes || '-'}</TableCell>
                          <TableCell className="text-center">{item.is_gross ? 'Ja' : 'Nein'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(parseFloat(item.estimated_amount) || 0)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setManualBlockItems(prev => prev.filter((_, i) => i !== index))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsManualBlockItemsOpen(false); setPendingBlockId(null); setManualBlockItems([]); }}>Abbrechen</Button>
                <Button onClick={handleSaveBlockItems} disabled={manualBlockItems.length === 0}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Speichern
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Copy Blocks Dialog (when creating new version) */}
        <Dialog open={isCopyBlocksOpen} onOpenChange={(open) => { if (!open) { setIsCopyBlocksOpen(false); setPendingNewVersionId(null); setCopyBlockIds([]); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Blöcke übernehmen</DialogTitle>
              <DialogDescription>
                Wählen Sie manuelle Blöcke aus der vorherigen Version, die in die neue Version kopiert werden sollen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {(() => {
                const prevVersion = versions.length > 1
                  ? [...versions].sort((a, b) => b.version_number - a.version_number)[1]
                  : null;
                if (!prevVersion) return null;
                const prevManualBlocks = allBlocks.filter(b => b.version_id === prevVersion.id && b.block_type === 'manual');
                return prevManualBlocks.map(block => (
                  <div key={block.id} className="flex items-center gap-3">
                    <Checkbox
                      checked={copyBlockIds.includes(block.id)}
                      onCheckedChange={(checked) => {
                        setCopyBlockIds(prev => checked
                          ? [...prev, block.id]
                          : prev.filter(id => id !== block.id)
                        );
                      }}
                    />
                    <div>
                      <p className="font-medium">{block.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {getItemsByBlock(block.id).length} Positionen
                      </p>
                    </div>
                  </div>
                ));
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCopyBlocksOpen(false); setPendingNewVersionId(null); setCopyBlockIds([]); toast({ title: 'Erfolg', description: 'Version erstellt (ohne Kopie).' }); }}>
                Überspringen
              </Button>
              <Button onClick={handleCopyBlocks} disabled={copyBlockIds.length === 0}>
                {copyBlockIds.length} Block(e) übernehmen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Item Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Position löschen?</AlertDialogTitle>
              <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground">Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Block Confirmation */}
        <AlertDialog open={!!deleteBlockId} onOpenChange={() => setDeleteBlockId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Block löschen?</AlertDialogTitle>
              <AlertDialogDescription>Der Block und alle seine Positionen werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteBlock} className="bg-destructive text-destructive-foreground">Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Document Picker Dialog */}
        <EstimateDocumentPicker
          open={isDocPickerOpen}
          onOpenChange={setIsDocPickerOpen}
          onSelect={handleDocumentSelect}
        />
      </div>
    </Layout>
  );
};
