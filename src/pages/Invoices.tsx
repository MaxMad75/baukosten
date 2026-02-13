import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInvoices } from '@/hooks/useInvoices';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useAuth } from '@/contexts/AuthContext';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { useToast } from '@/hooks/use-toast';
import { Invoice } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, CheckCircle2, XCircle, Euro, Trash2, Edit, Save, TrendingUp, Receipt, CreditCard,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
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

export const Invoices: React.FC = () => {
  const { invoices, loading, updateInvoice, deleteInvoice, markAsPaid } = useInvoices();
  const { getKostengruppeByCode } = useKostengruppen();
  const { profile } = useAuth();
  const { data: profiles } = useHouseholdProfiles();
  const { toast } = useToast();

  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const [editFormData, setEditFormData] = useState({
    company_name: '', invoice_number: '', invoice_date: '', amount: '', description: '', kostengruppe_code: '', is_gross: true,
  });

  const [paymentData, setPaymentData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    paid_by_profile_id: profile?.id || '',
  });

  const openEditDialog = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditFormData({
      company_name: invoice.company_name,
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.invoice_date,
      amount: String(invoice.amount),
      description: invoice.description || '',
      kostengruppe_code: invoice.kostengruppe_code || '',
      is_gross: invoice.is_gross ?? true,
    });
    setIsEditOpen(true);
  };

  const handleUpdateInvoice = async () => {
    if (!editingInvoice || !editFormData.company_name || !editFormData.invoice_date || !editFormData.amount) {
      toast({ title: 'Fehler', description: 'Bitte füllen Sie alle Pflichtfelder aus', variant: 'destructive' });
      return;
    }
    const success = await updateInvoice(editingInvoice.id, {
      company_name: editFormData.company_name,
      invoice_number: editFormData.invoice_number || null,
      invoice_date: editFormData.invoice_date,
      amount: parseFloat(editFormData.amount),
      description: editFormData.description || null,
      kostengruppe_code: editFormData.kostengruppe_code || null,
      is_gross: editFormData.is_gross,
    });
    if (success) { setIsEditOpen(false); setEditingInvoice(null); }
  };

  const handleMarkAsPaid = async () => {
    if (!selectedInvoice || !paymentData.paid_by_profile_id) return;
    const success = await markAsPaid(selectedInvoice, paymentData.paid_by_profile_id, paymentData.payment_date);
    if (success) { setIsPayDialogOpen(false); setSelectedInvoice(null); }
  };

  const handleMarkAsUnpaid = async (invoiceId: string) => {
    await updateInvoice(invoiceId, { is_paid: false, paid_by_profile_id: null, payment_date: null });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteInvoice(deleteId);
    setDeleteId(null);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const openPayDialog = (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    setPaymentData({ payment_date: format(new Date(), 'yyyy-MM-dd'), paid_by_profile_id: profile?.id || '' });
    setIsPayDialogOpen(true);
  };

  // Statistics
  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paidAmount = invoices.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
  const openAmount = totalAmount - paidAmount;
  const openCount = invoices.filter((i) => !i.is_paid).length;

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Rechnungen & Kosten</h1>
          <p className="text-muted-foreground">
            Übersicht und Verwaltung Ihrer Baurechnungen. Neue Rechnungen werden über die Dokumentenverwaltung hochgeladen.
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
              <p className="text-xs text-muted-foreground">{invoices.length} Rechnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(paidAmount)}</div>
              <p className="text-xs text-muted-foreground">{invoices.length - openCount} Rechnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
              <Receipt className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{formatCurrency(openAmount)}</div>
              <p className="text-xs text-muted-foreground">{openCount} Rechnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bezahlquote</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {invoices.length > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">nach Betrag</p>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Table */}
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Keine Rechnungen vorhanden</h3>
              <p className="text-muted-foreground">Laden Sie Rechnungen über die Dokumentenverwaltung hoch (Typ &quot;Rechnung&quot;).</p>
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
                    <TableHead className="hidden md:table-cell">Kostengruppe</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const kg = getKostengruppeByCode(invoice.kostengruppe_code || '');
                    const payer = profiles?.find((p) => p.id === invoice.paid_by_profile_id);
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>{format(new Date(invoice.invoice_date), 'dd.MM.yyyy', { locale: de })}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.company_name}</p>
                            {invoice.invoice_number && <p className="text-xs text-muted-foreground">Nr. {invoice.invoice_number}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {kg ? <span className="text-sm">{kg.code} - {kg.name}</span> : <span className="text-sm text-muted-foreground">–</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(invoice.amount))}
                          <span className="ml-1 text-xs text-muted-foreground">({invoice.is_gross ? 'brutto' : 'netto'})</span>
                        </TableCell>
                        <TableCell>
                          {invoice.is_paid ? (
                            <button onClick={() => handleMarkAsUnpaid(invoice.id)} className="flex items-center gap-1 text-green-600 hover:underline" title="Klicken zum Zurücksetzen">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm">Bezahlt{payer ? ` (${payer.name})` : ''}</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 text-orange-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">Offen</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!invoice.is_paid && (
                              <Button size="sm" variant="outline" onClick={() => openPayDialog(invoice.id)}>Bezahlt</Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => openEditDialog(invoice)}><Edit className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(invoice.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      </div>

      {/* Edit Invoice Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingInvoice(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rechnung bearbeiten</DialogTitle>
            <DialogDescription>Ändern Sie die Rechnungsdaten.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Firma *</Label>
                <Input value={editFormData.company_name} onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rechnungsnummer</Label>
                <Input value={editFormData.invoice_number} onChange={(e) => setEditFormData({ ...editFormData, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rechnungsdatum *</Label>
                <Input type="date" value={editFormData.invoice_date} onChange={(e) => setEditFormData({ ...editFormData, invoice_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Betrag (EUR) *</Label>
                <Input type="number" step="0.01" value={editFormData.amount} onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Kostengruppe (DIN 276)</Label>
                <KostengruppenSelect value={editFormData.kostengruppe_code} onValueChange={(v) => setEditFormData({ ...editFormData, kostengruppe_code: v })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Beschreibung</Label>
                <Textarea value={editFormData.description} onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Checkbox
                  id="edit-is-gross"
                  checked={editFormData.is_gross}
                  onCheckedChange={(checked) => setEditFormData({ ...editFormData, is_gross: !!checked })}
                />
                <Label htmlFor="edit-is-gross" className="cursor-pointer">Betrag inkl. MwSt (brutto)</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingInvoice(null); }}>Abbrechen</Button>
              <Button onClick={handleUpdateInvoice}><Save className="mr-2 h-4 w-4" />Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zahlung erfassen</DialogTitle>
            <DialogDescription>Markieren Sie diese Rechnung als bezahlt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Zahlungsdatum</Label>
              <Input type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Bezahlt von</Label>
              <Select value={paymentData.paid_by_profile_id} onValueChange={(v) => setPaymentData({ ...paymentData, paid_by_profile_id: v })}>
                <SelectTrigger><SelectValue placeholder="Person auswählen" /></SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleMarkAsPaid}>Als bezahlt markieren</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Invoices;
