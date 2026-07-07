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
import { useContractors } from '@/hooks/useContractors';
import { supabase } from '@/integrations/supabase/client';
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
  Loader2, Trash2, Edit, Save, CreditCard, Plus, Link2,
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
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoiceStatsCards } from '@/components/invoices/InvoiceStatsCards';
import { PaymentDistributionChart } from '@/components/invoices/PaymentDistributionChart';
import { PaymentsEditor } from '@/components/invoices/PaymentsEditor';
import { DeductionsEditor, DeductionRow, deductionRowAmount } from '@/components/invoices/DeductionsEditor';
import { useInvoiceDeductions, getPayableAmount } from '@/hooks/useInvoiceDeductions';
import { DEDUCTION_TYPE_LABELS } from '@/lib/types';

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
  const { allPayments, getPaymentsForInvoice, getTotalPaid, addPayment, deletePayment, deleteAllPayments, fetchAllPayments } = useInvoicePayments();
  const { getAllocationsForInvoice, getEffectiveAllocations, saveAllocations, fetchAllAllocations } = useInvoiceAllocations();
  const { getKostengruppeByCode } = useKostengruppen();
  const { estimateItems: activeEstimateItems } = useEstimates();
  const { profile } = useAuth();
  const { formatAmount } = usePrivacy();
  const { data: profiles } = useHouseholdProfiles();
  const { allSplits, getSplitsForInvoice, saveSplits } = useInvoiceSplits();
  const { allDeductions, getDeductionsForInvoice, saveDeductions } = useInvoiceDeductions();
  const { findOrCreateByName } = useContractors();
  const { toast } = useToast();

  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  // Destructive actions require explicit confirmation
  const [resetTarget, setResetTarget] = useState<Invoice | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  const [editFormData, setEditFormData] = useState({
    company_name: '', invoice_number: '', invoice_date: '', amount: '', description: '', kostengruppe_code: '', is_gross: true,
    status: 'draft' as InvoiceStatus,
  });

  // New-payment row in the edit dialog (payments are the single source of truth
  // for the Zahlungsverteilung and can be corrected here at any time)
  const [newPayment, setNewPayment] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    profile_id: '',
    amount: '',
  });

  // Allocation state for edit dialog
  const [useMultiAllocation, setUseMultiAllocation] = useState(false);
  const [editAllocations, setEditAllocations] = useState<AllocationRow[]>([]);

  // Deductions (Rechnungsprüfung) state for edit dialog
  const [editDeductions, setEditDeductions] = useState<DeductionRow[]>([]);

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
    setNewPayment({ payment_date: format(new Date(), 'yyyy-MM-dd'), profile_id: '', amount: '' });

    // Load deductions (Rechnungsprüfung)
    setEditDeductions(getDeductionsForInvoice(invoice.id).map((d) => ({
      deduction_type: d.deduction_type,
      label: d.label || '',
      mode: d.is_percentage ? 'percent' as const : 'absolute' as const,
      percentage: d.percentage != null ? String(d.percentage) : '',
      amount: String(d.amount),
    })));

    // Load allocations into the editor whenever they carry information the
    // simple single-KG path would silently drop on save (estimate links,
    // notes, or multiple rows).
    const existingAllocs = getAllocationsForInvoice(invoice.id);
    if (existingAllocs.length > 1 || existingAllocs.some(a => a.estimate_item_id || a.notes)) {
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
      // Keep linked documents consistent: the invoice is the master record,
      // so align the documents' contractor with the (possibly changed) company.
      if (editFormData.company_name !== editingInvoice.company_name) {
        const contractor = await findOrCreateByName(editFormData.company_name);
        if (contractor) {
          await supabase
            .from('documents')
            .update({ contractor_id: contractor.id })
            .eq('invoice_id', editingInvoice.id);
        }
      }

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

      // Save deductions; the DB trigger recalculates the status against the
      // new payable amount, so refetch invoices afterwards.
      await saveDeductions(editingInvoice.id, editDeductions
        .filter((r) => deductionRowAmount(r, invoiceAmt) > 0)
        .map((r) => ({
          deduction_type: r.deduction_type,
          label: r.deduction_type === 'sonstiges' ? r.label || null : null,
          is_percentage: r.mode === 'percent',
          percentage: r.mode === 'percent' ? parseFloat(r.percentage) || 0 : null,
          amount: deductionRowAmount(r, invoiceAmt),
          notes: null,
        })));
      await fetchInvoices();

      setIsEditOpen(false);
      setEditingInvoice(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    const inv = invoices.find(i => i.id === selectedInvoice);
    if (!inv) return;

    const payTarget = paymentData.amount
      ? parseFloat(paymentData.amount)
      : getPayableAmount(Number(inv.amount), getDeductionsForInvoice(inv.id));

    if (payUseSplit && paySplits.length > 0) {
      const totalAssigned = paySplits.reduce((s, e) => s + e.amount, 0);
      if (Math.abs(payTarget - totalAssigned) >= 0.01) {
        toast({ title: 'Fehler', description: 'Die Aufteilung stimmt nicht mit dem Zahlbetrag überein', variant: 'destructive' });
        return;
      }
      for (const split of paySplits) {
        await addPayment(selectedInvoice, split.profile_id, split.amount, paymentData.payment_date);
      }
    } else {
      if (!paymentData.paid_by_profile_id) return;
      await addPayment(selectedInvoice, paymentData.paid_by_profile_id, payTarget, paymentData.payment_date);
    }

    await fetchInvoices();
    setIsPayDialogOpen(false);
    setSelectedInvoice(null);
    toast({ title: 'Erfolg', description: 'Zahlung wurde erfasst' });
  };

  // Payment corrections inside the edit dialog — applied immediately,
  // invoice status is recalculated automatically.
  const handleAddPaymentInEdit = async () => {
    if (!editingInvoice || !newPayment.profile_id || !newPayment.amount) {
      toast({ title: 'Fehler', description: 'Bitte Person und Betrag angeben', variant: 'destructive' });
      return;
    }
    const ok = await addPayment(editingInvoice.id, newPayment.profile_id, parseFloat(newPayment.amount), newPayment.payment_date);
    if (ok) {
      await fetchInvoices();
      setNewPayment({ payment_date: format(new Date(), 'yyyy-MM-dd'), profile_id: '', amount: '' });
    }
  };

  const handleDeletePaymentInEdit = async (paymentId: string) => {
    if (!editingInvoice) return;
    const ok = await deletePayment(paymentId);
    if (ok) await fetchInvoices();
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
    // Offen = Zahlbetrag (Rechnungsbetrag − Abzüge) minus bereits bezahlt
    const remaining = inv
      ? getPayableAmount(Number(inv.amount), getDeductionsForInvoice(invoiceId)) - getTotalPaid(invoiceId)
      : 0;
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

  // Pie chart data — actual payments are the primary source, with
  // splits / paid_by as legacy fallback for old records.
  const pieData = useMemo(() => {
    const byPayer = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== 'paid' && inv.status !== 'partially_paid') continue;
      const payments = getPaymentsForInvoice(inv.id);
      const splits = getSplitsForInvoice(inv.id);
      const amounts = getEffectivePayerAmounts(inv, splits, payments);
      amounts.forEach((amount, profileId) => {
        byPayer.set(profileId, (byPayer.get(profileId) || 0) + amount);
      });
    }
    return Array.from(byPayer.entries()).map(([profileId, amount]) => {
      const p = profiles?.find((pr) => pr.id === profileId);
      return { name: p?.name || 'Unbekannt', value: amount };
    });
  }, [invoices, profiles, getPaymentsForInvoice, getSplitsForInvoice]);

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  const selectedInvoiceObj = selectedInvoice ? invoices.find(i => i.id === selectedInvoice) : null;
  const selectedDeductions = selectedInvoiceObj ? getDeductionsForInvoice(selectedInvoiceObj.id) : [];
  const selectedPayable = selectedInvoiceObj ? getPayableAmount(Number(selectedInvoiceObj.amount), selectedDeductions) : 0;
  const selectedRemainingAmount = selectedInvoiceObj ? selectedPayable - getTotalPaid(selectedInvoiceObj.id) : 0;

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
        <InvoiceStatsCards invoices={invoices} deductions={allDeductions} payments={allPayments} formatAmount={formatAmount} />

        {/* Sicherheitseinbehalte — einbehalten, kann später noch fällig werden */}
        {(() => {
          const retentions = allDeductions
            .filter((d) => d.deduction_type === 'sicherheitseinbehalt')
            .map((d) => ({ deduction: d, invoice: invoices.find((i) => i.id === d.invoice_id) }))
            .filter((r): r is { deduction: typeof r.deduction; invoice: Invoice } => !!r.invoice);
          if (retentions.length === 0) return null;
          const total = retentions.reduce((s, r) => s + Number(r.deduction.amount), 0);
          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sicherheitseinbehalte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {retentions.map(({ deduction, invoice }) => (
                  <div key={deduction.id} className="flex items-center justify-between text-sm">
                    <span>
                      {invoice.company_name}
                      {invoice.invoice_number && <span className="text-muted-foreground"> · Nr. {invoice.invoice_number}</span>}
                      <span className="text-muted-foreground"> · {format(new Date(invoice.invoice_date), 'dd.MM.yyyy', { locale: de })}</span>
                    </span>
                    <span className="font-medium">{formatAmount(Number(deduction.amount))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>Gesamt einbehalten</span>
                  <span>{formatAmount(total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Einbehaltene Beträge können nach Ablauf der Gewährleistung (oder gegen Bürgschaft) noch nachgefordert werden.
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Payment Distribution Pie Chart */}
        <PaymentDistributionChart data={pieData} formatAmount={formatAmount} />

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
                          {(() => {
                            const deductions = getDeductionsForInvoice(invoice.id);
                            if (deductions.length === 0) return null;
                            const payable = getPayableAmount(Number(invoice.amount), deductions);
                            return (
                              <TooltipProvider>
                                <UiTooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs text-muted-foreground cursor-help">
                                      Zahlbetrag {formatAmount(payable)}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-0.5 text-xs">
                                      {deductions.map((d) => (
                                        <div key={d.id} className="flex justify-between gap-4">
                                          <span>{d.deduction_type === 'sonstiges' && d.label ? d.label : DEDUCTION_TYPE_LABELS[d.deduction_type]}{d.is_percentage && d.percentage != null ? ` (${d.percentage}%)` : ''}</span>
                                          <span>−{formatAmount(Number(d.amount))}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </UiTooltip>
                              </TooltipProvider>
                            );
                          })()}
                          {totalPaid > 0 && totalPaid < getPayableAmount(Number(invoice.amount), getDeductionsForInvoice(invoice.id)) && (
                            <div className="text-xs text-muted-foreground">
                              {formatAmount(totalPaid)} bezahlt
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {status === 'paid' || status === 'partially_paid' ? (
                            <button onClick={() => setResetTarget(invoice)} title="Zahlungen zurücksetzen…">
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

            {/* Deductions Editor — Skonto, Sicherheitseinbehalt etc. */}
            <DeductionsEditor
              invoiceAmount={parseFloat(editFormData.amount) || 0}
              rows={editDeductions}
              onChange={setEditDeductions}
              formatAmount={formatAmount}
            />

            {/* Payments Editor — single source of truth for the Zahlungsverteilung.
                Measured against the payable amount (invoice minus deductions). */}
            {editingInvoice && profiles && profiles.length > 0 && (() => {
              const amt = parseFloat(editFormData.amount) || 0;
              const payable = Math.max(Math.round((amt - editDeductions.reduce((s, r) => s + deductionRowAmount(r, amt), 0)) * 100) / 100, 0);
              return (
                <PaymentsEditor
                  payments={getPaymentsForInvoice(editingInvoice.id)}
                  profiles={profiles}
                  invoiceAmount={payable}
                  newPayment={newPayment}
                  onNewPaymentChange={setNewPayment}
                  onAdd={handleAddPaymentInEdit}
                  onDelete={(paymentId) => setDeletePaymentId(paymentId)}
                  formatAmount={formatAmount}
                />
              );
            })()}

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
                  {selectedInvoiceObj.company_name} — Rechnungsbetrag: {formatAmount(Number(selectedInvoiceObj.amount))}
                  {selectedDeductions.length > 0 && (
                    <> — Abzüge: −{formatAmount(Number(selectedInvoiceObj.amount) - selectedPayable)} — Zahlbetrag: {formatAmount(selectedPayable)}</>
                  )}
                  {selectedRemainingAmount < selectedPayable && selectedRemainingAmount > 0 && (
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
                  invoiceAmount={paymentData.amount ? parseFloat(paymentData.amount) : selectedPayable}
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

      {/* Reset Payments Confirmation */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zahlungen zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetTarget && (() => {
                const payments = getPaymentsForInvoice(resetTarget.id);
                const total = payments.reduce((s, p) => s + Number(p.amount), 0);
                return `Für „${resetTarget.company_name}" werden ${payments.length} Zahlung${payments.length === 1 ? '' : 'en'} über insgesamt ${formatAmount(total)} sowie die Kostenaufteilung gelöscht. Die Rechnung gilt danach wieder als offen. Diese Aktion kann nicht rückgängig gemacht werden.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (resetTarget) { await handleResetPayments(resetTarget.id); setResetTarget(null); } }}
            >
              Zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Single Payment Confirmation */}
      <AlertDialog open={!!deletePaymentId} onOpenChange={(o) => { if (!o) setDeletePaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zahlung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const p = editingInvoice && deletePaymentId
                  ? getPaymentsForInvoice(editingInvoice.id).find((x) => x.id === deletePaymentId)
                  : null;
                const payer = p ? profiles?.find((pr) => pr.id === p.profile_id) : null;
                return p
                  ? `Die Zahlung von ${payer?.name || 'Unbekannt'} über ${formatAmount(Number(p.amount))} vom ${format(new Date(p.payment_date), 'dd.MM.yyyy', { locale: de })} wird gelöscht. Der Rechnungsstatus wird neu berechnet.`
                  : 'Die Zahlung wird gelöscht. Der Rechnungsstatus wird neu berechnet.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (deletePaymentId) { await handleDeletePaymentInEdit(deletePaymentId); setDeletePaymentId(null); } }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Invoices;
