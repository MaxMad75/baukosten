import React, { useState, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useInvoices } from '@/hooks/useInvoices';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useAuth } from '@/contexts/AuthContext';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ExtractedInvoiceData } from '@/lib/types';
import { 
  Plus, 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Euro,
  Calendar,
  Building2,
  Trash2,
  Edit
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Invoices: React.FC = () => {
  const { invoices, loading, createInvoice, updateInvoice, deleteInvoice, markAsPaid } = useInvoices();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const { profile, household } = useAuth();
  const { data: profiles } = useHouseholdProfiles();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    invoice_number: '',
    invoice_date: '',
    amount: '',
    description: '',
    kostengruppe_code: '',
  });

  const [paymentData, setPaymentData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    paid_by_profile_id: profile?.id || '',
  });

  const resetForm = () => {
    setFormData({
      company_name: '',
      invoice_number: '',
      invoice_date: '',
      amount: '',
      description: '',
      kostengruppe_code: '',
    });
    setExtractedData(null);
    setUploadedFile(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !household) return;

    setUploading(true);
    try {
      // Upload file to storage
      const filePath = `${household.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setUploadedFile({ path: filePath, name: file.name });

      // Extract text from PDF
      setAnalyzing(true);
      const pdfText = await extractTextFromPDF(file);

      // Call AI analysis
      const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-invoice', {
        body: { pdfContent: pdfText, fileName: file.name }
      });

      if (functionError) throw functionError;

      if (functionData.error) {
        toast({
          title: 'AI-Analyse fehlgeschlagen',
          description: functionData.error,
          variant: 'destructive',
        });
      } else if (functionData.data) {
        const extracted = functionData.data as ExtractedInvoiceData;
        setExtractedData(extracted);
        setFormData({
          company_name: extracted.company_name || '',
          invoice_number: extracted.invoice_number || '',
          invoice_date: extracted.invoice_date || '',
          amount: String(extracted.amount || ''),
          description: extracted.description || '',
          kostengruppe_code: extracted.kostengruppe_code || '',
        });
        toast({
          title: 'Rechnung analysiert',
          description: 'Die Daten wurden extrahiert. Bitte überprüfen Sie die Angaben.',
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

  const handleCreateInvoice = async () => {
    if (!formData.company_name || !formData.invoice_date || !formData.amount) {
      toast({
        title: 'Fehler',
        description: 'Bitte füllen Sie alle Pflichtfelder aus',
        variant: 'destructive',
      });
      return;
    }

    const result = await createInvoice({
      company_name: formData.company_name,
      invoice_number: formData.invoice_number || null,
      invoice_date: formData.invoice_date,
      amount: parseFloat(formData.amount),
      description: formData.description || null,
      kostengruppe_code: formData.kostengruppe_code || null,
      file_path: uploadedFile?.path || null,
      file_name: uploadedFile?.name || null,
      ai_extracted: !!extractedData,
      is_paid: false,
    });

    if (result) {
      resetForm();
      setIsUploadOpen(false);
      setIsManualOpen(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!selectedInvoice || !paymentData.paid_by_profile_id) return;

    const success = await markAsPaid(
      selectedInvoice,
      paymentData.paid_by_profile_id,
      paymentData.payment_date
    );

    if (success) {
      setIsPayDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteInvoice(deleteId);
    setDeleteId(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const openPayDialog = (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    setPaymentData({
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      paid_by_profile_id: profile?.id || '',
    });
    setIsPayDialogOpen(true);
  };

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
            <h1 className="text-3xl font-bold">Rechnungen</h1>
            <p className="text-muted-foreground">Verwalten Sie Ihre Baurechnungen</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isUploadOpen} onOpenChange={(open) => { setIsUploadOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  PDF hochladen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Rechnung hochladen</DialogTitle>
                  <DialogDescription>
                    Laden Sie eine PDF-Rechnung hoch. Die Daten werden automatisch extrahiert.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {!extractedData && (
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
                            {analyzing ? 'AI analysiert Rechnung...' : 'Hochladen...'}
                          </p>
                        </div>
                      ) : (
                        <>
                          <FileText className="h-12 w-12 text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            PDF-Rechnung hier ablegen oder klicken
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

                  {extractedData && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                        ✓ Daten wurden extrahiert. Bitte überprüfen und ggf. korrigieren.
                      </div>
                      
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Firma *</Label>
                          <Input
                            value={formData.company_name}
                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rechnungsnummer</Label>
                          <Input
                            value={formData.invoice_number}
                            onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rechnungsdatum *</Label>
                          <Input
                            type="date"
                            value={formData.invoice_date}
                            onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Betrag (EUR) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label>Kostengruppe (DIN 276)</Label>
                          <KostengruppenSelect
                            value={formData.kostengruppe_code}
                            onValueChange={(value) => setFormData({ ...formData, kostengruppe_code: value })}
                          />
                          {extractedData?.kostengruppe_reasoning && (
                            <p className="text-xs text-muted-foreground">
                              AI-Begründung: {extractedData.kostengruppe_reasoning}
                            </p>
                          )}
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label>Beschreibung</Label>
                          <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { resetForm(); setIsUploadOpen(false); }}>
                          Abbrechen
                        </Button>
                        <Button onClick={handleCreateInvoice}>
                          Rechnung speichern
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isManualOpen} onOpenChange={(open) => { setIsManualOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Manuell erfassen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Rechnung manuell erfassen</DialogTitle>
                  <DialogDescription>
                    Geben Sie die Rechnungsdaten manuell ein.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Firma *</Label>
                      <Input
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        placeholder="z.B. Elektro Müller GmbH"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rechnungsnummer</Label>
                      <Input
                        value={formData.invoice_number}
                        onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                        placeholder="z.B. 2024-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rechnungsdatum *</Label>
                      <Input
                        type="date"
                        value={formData.invoice_date}
                        onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Betrag (EUR) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Kostengruppe (DIN 276)</Label>
                      <KostengruppenSelect
                        value={formData.kostengruppe_code}
                        onValueChange={(value) => setFormData({ ...formData, kostengruppe_code: value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Beschreibung</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Optionale Beschreibung der Leistung"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { resetForm(); setIsManualOpen(false); }}>
                      Abbrechen
                    </Button>
                    <Button onClick={handleCreateInvoice}>
                      Rechnung speichern
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Invoice List */}
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Keine Rechnungen vorhanden</h3>
              <p className="text-muted-foreground">Laden Sie Ihre erste Rechnung hoch.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Alle Rechnungen ({invoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>Kostengruppe</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const kg = getKostengruppeByCode(invoice.kostengruppe_code || '');
                    const payer = profiles?.find(p => p.id === invoice.paid_by_profile_id);
                    
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          {format(new Date(invoice.invoice_date), 'dd.MM.yyyy', { locale: de })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.company_name}</p>
                            {invoice.invoice_number && (
                              <p className="text-xs text-muted-foreground">Nr. {invoice.invoice_number}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {kg ? (
                            <span className="text-sm">
                              {kg.code} - {kg.name}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(invoice.amount))}
                        </TableCell>
                        <TableCell>
                          {invoice.is_paid ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm">
                                Bezahlt{payer ? ` (${payer.name})` : ''}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-orange-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">Offen</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!invoice.is_paid && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPayDialog(invoice.id)}
                              >
                                Als bezahlt markieren
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(invoice.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pay Dialog */}
        <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zahlung erfassen</DialogTitle>
              <DialogDescription>
                Markieren Sie diese Rechnung als bezahlt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Zahlungsdatum</Label>
                <Input
                  type="date"
                  value={paymentData.payment_date}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bezahlt von</Label>
                <Select
                  value={paymentData.paid_by_profile_id}
                  onValueChange={(value) => setPaymentData({ ...paymentData, paid_by_profile_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Person auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleMarkAsPaid}>
                  Als bezahlt markieren
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default Invoices;
