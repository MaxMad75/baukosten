import React, { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInvoices } from '@/hooks/useInvoices';
import { useInvoicePayments } from '@/hooks/useInvoicePayments';
import { useInvoiceAllocations } from '@/hooks/useInvoiceAllocations';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useEstimates } from '@/hooks/useEstimates';
import { useAuth } from '@/contexts/AuthContext';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { useInvoiceSplits, getEffectivePayerAmounts } from '@/hooks/useInvoiceSplits';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { InvoiceSplitEditor, SplitEntry, SplitMode } from '@/components/InvoiceSplitEditor';
import { useToast } from '@/hooks/use-toast';
import { Invoice, InvoiceStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, CheckCircle2, XCircle, Euro, Trash2, Edit, Save, TrendingUp, Receipt, CreditCard, Plus, Link2,
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
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

const PIE_COLORS = ['hsl(220, 70%, 55%)', 'hsl(150, 60%, 45%)', 'hsl(35, 85%, 55%)', 'hsl(0, 70%, 55%)', 'hsl(270, 60%, 55%)', 'hsl(180, 50%, 45%)'];

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { label: 'Entwurf', variant: 'secondary', className: '' },
  review_needed: { label: 'Prüfung', variant: 'outline', className: 'border-amber-500 text-amber-700' },
  approved: { label: 'Freigegeben', variant: 'outline', className: 'border-blue-500 text-blue-700' },
  partially_paid: { label: 'Teilbezahlt', variant: 'outline', className: 'border-orange-500 text-orange-700' },
  paid: { label: 'Bezahlt', variant: 'default', className: 'bg-green-600 hover:bg-green-600' },
  cancelled: { label: 'Storniert', variant: 'destructive', className: '' },
};

interface AllocationRow {
  kostengruppe_code: string;
  estimate_item_id: string | null;
  amount: string;
  notes: string;
}

export const Invoices: React.FC = () => {
  const { invoices, loading, updateInvoice, deleteInvoice, fetchInvoices } = useInvoices();
  const { getPaymentsForInvoice, getTotalPaid, addPayment, deleteAllPayments, fetchAllPayments } = useInvoicePayments();
  const { getAllocationsForInvoice, getEffectiveAllocations, saveAllocations, fetchAllAllocations } = useInvoiceAllocations();
  const { getKostengruppeByCode } = useKostengruppen();
  const { estimateItems: activeEstimateItems } = useEstimates();
  const { profile } = useAuth();
  const { formatAmount } = usePrivacy();
  const { data: profiles } = useHouseholdProfiles();
  const { allSplits, getSplitsForInvoice, saveSplits } = useInvoiceSplits();
  const { toast } = useToast();

  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const [editFormData, setEditFormData] = useState({
    company_name: '', invoice_number: '', invoice_date: '', amount: '', description: '', kostengruppe_code: '', is_gross: true,
    status: 'draft' as InvoiceStatus,
  });

  // Split state for edit dialog
  const [editSplits, setEditSplits] = useState<SplitEntry[]>([]);
  const [editSplitMode, setEditSplitMode] = useState<SplitMode>('equal');

  // Allocation state for edit dialog
  const [useMultiAllocation, setUseMultiAllocation] = useState(false);
  const [editAllocations, setEditAllocations] = useState<AllocationRow[]>([]);

  // Pay dialog state
  const [paymentData, setPaymentData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    paid_by_profile_id: profile?.id || '',
    amount: '',
  });
  const [payUseSplit, setPayUseSplit] = useState(false);
  const [paySplits, setPaySplits] = useState<SplitEntry[]>([]);
  const [paySplitMode, setPaySplitMode] = useState<SplitMode>('equal');

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
      status: (invoice.status as InvoiceStatus) || 'draft',
    });
    const existing = getSplitsForInvoice(invoice.id);
    if (existing.length > 0) {
      setEditSplits(existing.map(s => ({ profile_id: s.profile_id, amount: Number(s.amount), percentage: s.percentage, split_type: s.split_type })));
      setEditSplitMode(existing[0].split_type as SplitMode);
    } else {
      setEditSplits([]);
      setEditSplitMode('equal');
    }

    // Load allocations
    const existingAllocs = getAllocationsForInvoice(invoice.id);
    if (existingAllocs.length > 1) {
      setUseMultiAllocation(true);
      setEditAllocations(existingAllocs.map(a => ({
        kostengruppe_code: a.kostengruppe_code,
        estimate_item_id: a.estimate_item_id,
        amount: String(a.amount),
        notes: a.notes || '',
      })));
    } else {
      setUseMultiAllocation(false);
      setEditAllocations([]);
    }

    setIsEditOpen(true);
  };

  const handleUpdateInvoice = async () => {
    if (!editingInvoice || !editFormData.company_name || !editFormData.invoice_date || !editFormData.amount) {
      toast({ title: 'Fehler', description: 'Bitte füllen Sie alle Pflichtfelder aus', variant: 'destructive' });
      return;
    }
    // Enforce cost group assignment
    const hasKg = useMultiAllocation
      ? editAllocations.some(a => !!a.kostengruppe_code)
      : !!editFormData.kostengruppe_code;
    if (!hasKg) {
      toast({ title: 'Fehler', description: 'Bitte weisen Sie mindestens eine Kostengruppe zu', variant: 'destructive' });
      return;
    }
    if (editSplits.length > 0) {
      const totalAssigned = editSplits.reduce((s, e) => s + e.amount, 0);
      const invoiceAmt = parseFloat(editFormData.amount);
      if (Math.abs(invoiceAmt - totalAssigned) >= 0.01) {
        toast({ title: 'Fehler', description: 'Die Kostenaufteilung stimmt nicht mit dem Rechnungsbetrag überein', variant: 'destructive' });
        return;
      }
    }

    const invoiceAmt = parseFloat(editFormData.amount);

    // Determine the primary kostengruppe_code (for legacy column)
    let primaryKg = editFormData.kostengruppe_code || null;
    if (useMultiAllocation && editAllocations.length > 0) {
      primaryKg = editAllocations[0].kostengruppe_code || null;
    }

    const success = await updateInvoice(editingInvoice.id, {
      company_name: editFormData.company_name,
      invoice_number: editFormData.invoice_number || null,
      invoice_date: editFormData.invoice_date,
      amount: invoiceAmt,
      description: editFormData.description || null,
      kostengruppe_code: primaryKg,
      is_gross: editFormData.is_gross,
      status: editFormData.status,
    });

    if (success) {
      await saveSplits(editingInvoice.id, editSplits);

      // Save allocations
      if (useMultiAllocation && editAllocations.length > 0) {
        const allocInputs = editAllocations.map(a => ({
          kostengruppe_code: a.kostengruppe_code,
          estimate_item_id: a.estimate_item_id || null,
          amount: parseFloat(a.amount) || 0,
          notes: a.notes || null,
        }));
        await saveAllocations(
          editingInvoice.id,
          allocInputs,
          invoiceAmt,
          activeEstimateItems.map(ei => ({ id: ei.id, kostengruppe_code: ei.kostengruppe_code }))
        );
      } else if (editFormData.kostengruppe_code) {
        // Single allocation - save as one row
        await saveAllocations(
          editingInvoice.id,
          [{ kostengruppe_code: editFormData.kostengruppe_code, amount: invoiceAmt }],
          invoiceAmt
        );
      }

      setIsEditOpen(false);
      setEditingInvoice(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    const inv = invoices.find(i => i.id === selectedInvoice);
    if (!inv) return;

    if (payUseSplit && paySplits.length > 0) {
      const totalAssigned = paySplits.reduce((s, e) => s + e.amount, 0);
      if (Math.abs(Number(inv.amount) - totalAssigned) >= 0.01) {
        toast({ title: 'Fehler', description: 'Die Kostenaufteilung stimmt nicht mit dem Rechnungsbetrag überein', variant: 'destructive' });
        return;
      }
      let success = true;
      for (const split of paySplits) {
        const ok = await addPayment(selectedInvoice, split.profile_id, split.amount, paymentData.payment_date);
        if (!ok) success = false;
      }
      if (success) {
        await saveSplits(selectedInvoice, paySplits);
      }
    } else {
      if (!paymentData.paid_by_profile_id) return;
      const payAmount = paymentData.amount ? parseFloat(paymentData.amount) : Number(inv.amount);
      await addPayment(selectedInvoice, paymentData.paid_by_profile_id, payAmount, paymentData.payment_date);
    }

    await fetchInvoices();
    setIsPayDialogOpen(false);
    setSelectedInvoice(null);
    toast({ title: 'Erfolg', description: 'Zahlung wurde erfasst' });
  };

  const handleResetPayments = async (invoiceId: string) => {
    await deleteAllPayments(invoiceId);
    await saveSplits(invoiceId, []);
    await fetchInvoices();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteInvoice(deleteId);
    setDeleteId(null);
  };

  const openPayDialog = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    const remaining = inv ? Number(inv.amount) - getTotalPaid(invoiceId) : 0;
    setSelectedInvoice(invoiceId);
    setPaymentData({
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      paid_by_profile_id: profile?.id || '',
      amount: remaining > 0 ? String(remaining) : '',
    });
    setPayUseSplit(false);
    setPaySplits([]);
    setPaySplitMode('equal');
    setIsPayDialogOpen(true);
  };

  // Allocation editor helpers
  const addAllocationRow = () => {
    setEditAllocations(prev => [...prev, { kostengruppe_code: '', estimate_item_id: null, amount: '', notes: '' }]);
  };

  const updateAllocationRow = (idx: number, field: keyof AllocationRow, value: string | null) => {
    setEditAllocations(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const removeAllocationRow = (idx: number) => {
    setEditAllocations(prev => prev.filter((_, i) => i !== idx));
  };

  // Get estimate items filtered by kostengruppe_code for a given allocation row
  const getEstimateItemsForKg = (kgCode: string) => {
    if (!kgCode) return [];
    return activeEstimateItems.filter(ei => ei.kostengruppe_code === kgCode);
  };

  // Statistics using status
  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paidAmount = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const partiallyPaidAmount = invoices.filter((i) => i.status === 'partially_paid').reduce((s, i) => s + Number(i.amount), 0);
  const openAmount = totalAmount - paidAmount;
  const openCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  // Pie chart data
  const pieData = useMemo(() => {
    const byPayer = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== 'paid' && inv.status !== 'partially_paid') continue;
      const splits = getSplitsForInvoice(inv.id);
      const amounts = getEffectivePayerAmounts(inv, splits);
      amounts.forEach((amount, profileId) => {
        byPayer.set(profileId, (byPayer.get(profileId) || 0) + amount);
      });
    }
    return Array.from(byPayer.entries()).map(([profileId, amount]) => {
      const p = profiles?.find((pr) => pr.id === profileId);
      return { name: p?.name || 'Unbekannt', value: amount };
    });
  }, [invoices, profiles, allSplits]);

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  const selectedInvoiceObj = selectedInvoice ? invoices.find(i => i.id === selectedInvoice) : null;
  const selectedRemainingAmount = selectedInvoiceObj ? Number(selectedInvoiceObj.amount) - getTotalPaid(selectedInvoiceObj.id) : 0;

  // Allocation summary helper for invoice list
  const renderAllocationSummary = (invoice: Invoice) => {
    const allocs = getAllocationsForInvoice(invoice.id);
    if (allocs.length === 0) {
      // Legacy fallback
      const kg = getKostengruppeByCode(invoice.kostengruppe_code || '');
      if (kg) return <span className="text-sm">{kg.code} - {kg.name}</span>;
      return <span className="text-sm text-muted-foreground">–</span>;
    }
    if (allocs.length === 1) {
      const kg = getKostengruppeByCode(allocs[0].kostengruppe_code);
      const hasEstLink = !!allocs[0].estimate_item_id;
      return (
        <span className="text-sm flex items-center gap-1">
          {kg ? `${kg.code} - ${kg.name}` : allocs[0].kostengruppe_code}
          {hasEstLink && <Link2 className="h-3 w-3 text-muted-foreground" />}
        </span>
      );
    }
    // Multiple allocations
    const hasEstLinks = allocs.some(a => a.estimate_item_id);
    return (
      <TooltipProvider>
        <UiTooltip>
          <TooltipTrigger asChild>
            <span className="text-sm flex items-center gap-1 cursor-help">
              <Badge variant="outline" className="text-xs">{allocs.length} Zuordnungen</Badge>
              {hasEstLinks && <Link2 className="h-3 w-3 text-muted-foreground" />}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              {allocs.map((a, idx) => {
                const kg = getKostengruppeByCode(a.kostengruppe_code);
                return (
                  <div key={idx} className="text-xs flex justify-between gap-4">
                    <span>{kg ? `${kg.code} ${kg.name}` : a.kostengruppe_code}</span>
                    <span className="font-medium">{formatAmount(Number(a.amount))}</span>
                  </div>
                );
              })}
            </div>
          </TooltipContent>
        </UiTooltip>
      </TooltipProvider>
    );
  };

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
              <div className="text-2xl font-bold">{formatAmount(totalAmount)}</div>
              <p className="text-xs text-muted-foreground">{invoices.length} Rechnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatAmount(paidAmount)}</div>
              <p className="text-xs text-muted-foreground">{invoices.filter(i => i.status === 'paid').length} Rechnungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
              <Receipt className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{formatAmount(openAmount)}</div>
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
                {totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">nach Betrag</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Distribution Pie Chart */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Zahlungsverteilung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAmount(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

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
                    const status = (invoice.status as InvoiceStatus) || 'draft';
                    const statusCfg = STATUS_CONFIG[status];
                    const totalPaid = getTotalPaid(invoice.id);
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
                          {renderAllocationSummary(invoice)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div>
                            {formatAmount(Number(invoice.amount))}
                            <span className="ml-1 text-xs text-muted-foreground">({invoice.is_gross ? 'brutto' : 'netto'})</span>
                          </div>
                          {totalPaid > 0 && totalPaid < Number(invoice.amount) && (
                            <div className="text-xs text-muted-foreground">
                              {formatAmount(totalPaid)} bezahlt
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {status === 'paid' || status === 'partially_paid' ? (
                            <button onClick={() => handleResetPayments(invoice.id)} title="Klicken zum Zurücksetzen">
                              <Badge variant={statusCfg.variant} className={statusCfg.className}>
                                {statusCfg.label}
                              </Badge>
                            </button>
                          ) : (
                            <Badge variant={statusCfg.variant} className={statusCfg.className}>
                              {statusCfg.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {status !== 'paid' && status !== 'cancelled' && (
                              <Button size="sm" variant="outline" onClick={() => openPayDialog(invoice.id)}>Zahlung</Button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editFormData.status} onValueChange={(v) => setEditFormData({ ...editFormData, status: v as InvoiceStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                      const isPaymentDerived = key === 'paid' || key === 'partially_paid';
                      return (
                        <SelectItem key={key} value={key} disabled={isPaymentDerived}>
                          {cfg.label}{isPaymentDerived ? ' (automatisch)' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {!useMultiAllocation && (
                <div className="space-y-2">
                  <Label>Kostengruppe (DIN 276)</Label>
                  <KostengruppenSelect value={editFormData.kostengruppe_code} onValueChange={(v) => setEditFormData({ ...editFormData, kostengruppe_code: v })} />
                </div>
              )}
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

            {/* Allocation Editor */}
            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Switch checked={useMultiAllocation} onCheckedChange={(checked) => {
                  setUseMultiAllocation(checked);
                  if (checked && editAllocations.length === 0) {
                    // Initialize with current single KG if set
                    if (editFormData.kostengruppe_code) {
                      setEditAllocations([{ kostengruppe_code: editFormData.kostengruppe_code, estimate_item_id: null, amount: editFormData.amount, notes: '' }]);
                    } else {
                      setEditAllocations([{ kostengruppe_code: '', estimate_item_id: null, amount: editFormData.amount, notes: '' }]);
                    }
                  }
                }} id="multi-alloc-toggle" />
                <Label htmlFor="multi-alloc-toggle" className="cursor-pointer text-sm">Aufteilen auf mehrere Positionen</Label>
              </div>

              {useMultiAllocation && (
                <div className="space-y-2">
                  {editAllocations.map((alloc, idx) => {
                    const matchingItems = getEstimateItemsForKg(alloc.kostengruppe_code);
                    return (
                      <div key={idx} className="grid gap-2 grid-cols-[1fr_1fr_100px_auto] items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Kostengruppe</Label>
                          <KostengruppenSelect
                            value={alloc.kostengruppe_code}
                            onValueChange={(v) => {
                              updateAllocationRow(idx, 'kostengruppe_code', v);
                              updateAllocationRow(idx, 'estimate_item_id', null);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          {matchingItems.length > 0 ? (
                            <>
                              <Label className="text-xs">Schätzposition</Label>
                              <Select
                                value={alloc.estimate_item_id || 'none'}
                                onValueChange={(v) => updateAllocationRow(idx, 'estimate_item_id', v === 'none' ? null : v)}
                              >
                                <SelectTrigger className="h-9"><SelectValue placeholder="Optional" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Keine</SelectItem>
                                  {matchingItems.map(ei => (
                                    <SelectItem key={ei.id} value={ei.id}>
                                      {formatAmount(Number(ei.estimated_amount))} {ei.notes ? `– ${ei.notes}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </>
                          ) : (
                            <div className="h-9" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Betrag</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={alloc.amount}
                            onChange={(e) => updateAllocationRow(idx, 'amount', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeAllocationRow(idx)} className="h-9 w-9">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between">
                    <Button size="sm" variant="outline" onClick={addAllocationRow}>
                      <Plus className="h-4 w-4 mr-1" /> Position
                    </Button>
                    {editAllocations.length > 0 && (
                      <span className={`text-xs ${
                        Math.abs(editAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0) - (parseFloat(editFormData.amount) || 0)) < 0.01
                          ? 'text-green-600' : 'text-destructive'
                      }`}>
                        Summe: {formatAmount(editAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0))}
                        {' / '}{formatAmount(parseFloat(editFormData.amount) || 0)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Split Editor in Edit Dialog */}
            {profiles && profiles.length > 0 && (
              <InvoiceSplitEditor
                invoiceAmount={parseFloat(editFormData.amount) || 0}
                profiles={profiles}
                splits={editSplits}
                onChange={setEditSplits}
                mode={editSplitMode}
                onModeChange={setEditSplitMode}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingInvoice(null); }}>Abbrechen</Button>
              <Button onClick={handleUpdateInvoice}><Save className="mr-2 h-4 w-4" />Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Zahlung erfassen</DialogTitle>
            <DialogDescription>
              {selectedInvoiceObj && (
                <>
                  {selectedInvoiceObj.company_name} — Gesamt: {formatAmount(Number(selectedInvoiceObj.amount))}
                  {selectedRemainingAmount < Number(selectedInvoiceObj.amount) && selectedRemainingAmount > 0 && (
                    <> — Offen: {formatAmount(selectedRemainingAmount)}</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Zahlungsdatum</Label>
                <Input type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Betrag (EUR)</Label>
                <Input type="number" step="0.01" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} placeholder="Gesamtbetrag" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={payUseSplit} onCheckedChange={setPayUseSplit} id="pay-split-toggle" />
              <Label htmlFor="pay-split-toggle" className="cursor-pointer">Auf mehrere Personen aufteilen</Label>
            </div>

            {!payUseSplit ? (
              <div className="space-y-2">
                <Label>Bezahlt von</Label>
                <Select value={paymentData.paid_by_profile_id} onValueChange={(v) => setPaymentData({ ...paymentData, paid_by_profile_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Person auswählen" /></SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              profiles && selectedInvoiceObj && (
                <InvoiceSplitEditor
                  invoiceAmount={paymentData.amount ? parseFloat(paymentData.amount) : Number(selectedInvoiceObj.amount)}
                  profiles={profiles}
                  splits={paySplits}
                  onChange={setPaySplits}
                  mode={paySplitMode}
                  onModeChange={setPaySplitMode}
                />
              )
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleRecordPayment}>Zahlung erfassen</Button>
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
