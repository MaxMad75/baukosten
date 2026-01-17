import React, { useState, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useAuth } from '@/contexts/AuthContext';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ExtractedEstimateData, ArchitectEstimateItem } from '@/lib/types';
import { 
  Plus, 
  Upload, 
  FileText, 
  Loader2, 
  Trash2,
  Calculator,
  CheckCircle2
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

export const Estimates: React.FC = () => {
  const { 
    estimates, 
    estimateItems, 
    loading, 
    createEstimate, 
    addEstimateItems,
    deleteEstimateItem,
    getItemsByEstimate 
  } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const { household } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedEstimateData['items']>([]);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null);
  const [pendingEstimateId, setPendingEstimateId] = useState<string | null>(null);

  // Manual item form
  const [manualItem, setManualItem] = useState({
    kostengruppe_code: '',
    estimated_amount: '',
    notes: '',
  });

  const resetForm = () => {
    setExtractedItems([]);
    setUploadedFile(null);
    setPendingEstimateId(null);
    setManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !household) return;

    setUploading(true);
    try {
      // Upload file to storage
      const filePath = `${household.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('estimates')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setUploadedFile({ path: filePath, name: file.name });

      // Create estimate record
      const estimate = await createEstimate(filePath, file.name);
      if (!estimate) throw new Error('Could not create estimate');
      
      setPendingEstimateId(estimate.id);

      // Extract text from PDF
      setAnalyzing(true);
      const pdfText = await extractTextFromPDF(file);

      // Call AI analysis
      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-estimate', {
        body: { pdfContent: pdfText, fileName: file.name }
      });

      if (functionError) throw functionError;

      if (functionData.error) {
        toast({
          title: 'AI-Analyse fehlgeschlagen',
          description: functionData.error,
          variant: 'destructive',
        });
      } else if (functionData.data?.items) {
        setExtractedItems(functionData.data.items);
        toast({
          title: 'Kostenschätzung analysiert',
          description: `${functionData.data.items.length} Kostenpositionen extrahiert.`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Fehler',
        description: 'Datei konnte nicht verarbeitet werden',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const handleSaveExtractedItems = async () => {
    if (!pendingEstimateId || extractedItems.length === 0) return;

    const success = await addEstimateItems(pendingEstimateId, extractedItems);
    if (success) {
      toast({
        title: 'Erfolg',
        description: 'Kostenschätzung wurde gespeichert.',
      });
      resetForm();
      setIsUploadOpen(false);
    }
  };

  const updateExtractedItem = (index: number, field: string, value: string | number) => {
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
    }]);

    setManualItem({ kostengruppe_code: '', estimated_amount: '', notes: '' });
  };

  const handleDeleteItem = async () => {
    if (!deleteId) return;
    await deleteEstimateItem(deleteId);
    setDeleteId(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const totalEstimated = estimateItems.reduce((sum, item) => sum + Number(item.estimated_amount), 0);

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
                  Laden Sie die Kostenkalkulation Ihres Architekten als PDF hoch.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {extractedItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {uploading || analyzing ? (
                      <div className="text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          {analyzing ? 'AI analysiert Kostenschätzung...' : 'Hochladen...'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <Calculator className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          PDF-Kostenschätzung hier ablegen oder klicken
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

                {extractedItems.length > 0 && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      ✓ {extractedItems.length} Kostenpositionen extrahiert. Bitte überprüfen und ggf. korrigieren.
                    </div>

                    {/* Manual add form */}
                    <div className="rounded-lg border p-4">
                      <h4 className="mb-3 font-medium">Position hinzufügen</h4>
                      <div className="grid gap-3 md:grid-cols-4">
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
                        <TableRow className="font-bold">
                          <TableCell colSpan={2}>Gesamt</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(extractedItems.reduce((s, i) => s + Number(i.estimated_amount), 0))}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
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
        </div>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Gesamtschätzung</CardTitle>
            <CardDescription>Summe aller geschätzten Kosten</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(totalEstimated)}
            </div>
            <p className="text-sm text-muted-foreground">
              {estimateItems.length} Kostenpositionen in {estimates.length} Schätzung(en)
            </p>
          </CardContent>
        </Card>

        {/* Estimates List */}
        {estimates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calculator className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Keine Kostenschätzungen vorhanden</h3>
              <p className="text-muted-foreground">Laden Sie die Kalkulation Ihres Architekten hoch.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Hochgeladene Schätzungen</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {estimates.map((estimate) => {
                  const items = getItemsByEstimate(estimate.id);
                  const estimateTotal = items.reduce((s, i) => s + Number(i.estimated_amount), 0);
                  
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
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(estimateTotal)}</p>
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
                              <TableHead className="text-right">Betrag</TableHead>
                              <TableHead className="w-16"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item) => {
                              const kg = getKostengruppeByCode(item.kostengruppe_code);
                              return (
                                <TableRow key={item.id}>
                                  <TableCell className="font-mono">{item.kostengruppe_code}</TableCell>
                                  <TableCell>{kg?.name || '-'}</TableCell>
                                  <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(Number(item.estimated_amount))}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => setDeleteId(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
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
      </div>
    </Layout>
  );
};

export default Estimates;
