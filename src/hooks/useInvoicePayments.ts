import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { InvoicePayment, InvoiceStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useInvoicePayments() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [allPayments, setAllPayments] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllPayments = useCallback(async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_payments')
      .select('*');

    if (!error && data) {
      setAllPayments(data as InvoicePayment[]);
    }
    setLoading(false);
  }, [household]);

  useEffect(() => {
    fetchAllPayments();
  }, [fetchAllPayments]);

  const getPaymentsForInvoice = useCallback(
    (invoiceId: string) => allPayments.filter((p) => p.invoice_id === invoiceId),
    [allPayments]
  );

  const getTotalPaid = useCallback(
    (invoiceId: string) => {
      return allPayments
        .filter((p) => p.invoice_id === invoiceId)
        .reduce((sum, p) => sum + Number(p.amount), 0);
    },
    [allPayments]
  );

  /**
   * Derives the invoice status from payment totals.
   * Only updates payment-related statuses; leaves 'cancelled', 'review_needed' etc. untouched.
   */
  const deriveStatus = (
    currentStatus: InvoiceStatus,
    invoiceAmount: number,
    totalPaid: number
  ): InvoiceStatus => {
    if (currentStatus === 'cancelled') return 'cancelled';
    if (totalPaid >= invoiceAmount - 0.01) return 'paid';
    if (totalPaid > 0) return 'partially_paid';
    // If no payments, keep approved or draft
    if (currentStatus === 'approved' || currentStatus === 'review_needed') return currentStatus;
    return 'draft';
  };

  const addPayment = async (
    invoiceId: string,
    profileId: string,
    amount: number,
    paymentDate: string,
    notes?: string
  ) => {
    const { error } = await supabase
      .from('invoice_payments')
      .insert({
        invoice_id: invoiceId,
        profile_id: profileId,
        amount,
        payment_date: paymentDate,
        notes: notes || null,
      });

    if (error) {
      toast({ title: 'Fehler', description: 'Zahlung konnte nicht gespeichert werden', variant: 'destructive' });
      return false;
    }

    // Recalculate and update invoice status
    await recalculateInvoiceStatus(invoiceId);
    await fetchAllPayments();
    return true;
  };

  const deletePayment = async (paymentId: string, invoiceId: string) => {
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId);

    if (error) {
      toast({ title: 'Fehler', description: 'Zahlung konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }

    await recalculateInvoiceStatus(invoiceId);
    await fetchAllPayments();
    return true;
  };

  const deleteAllPayments = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', invoiceId);

    if (error) return false;

    await recalculateInvoiceStatus(invoiceId);
    await fetchAllPayments();
    return true;
  };

  const recalculateInvoiceStatus = async (invoiceId: string) => {
    // Get current invoice
    const { data: invoice } = await supabase
      .from('invoices')
      .select('amount, status, is_paid')
      .eq('id', invoiceId)
      .single();

    if (!invoice) return;

    // Get total payments
    const { data: payments } = await supabase
      .from('invoice_payments')
      .select('amount')
      .eq('invoice_id', invoiceId);

    const totalPaid = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
    const newStatus = deriveStatus(invoice.status as InvoiceStatus, Number(invoice.amount), totalPaid);
    const isPaid = newStatus === 'paid';

    await supabase
      .from('invoices')
      .update({
        status: newStatus,
        is_paid: isPaid,
        // Keep backward compat fields in sync
        payment_date: isPaid ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', invoiceId);
  };

  return {
    allPayments,
    loading,
    getPaymentsForInvoice,
    getTotalPaid,
    deriveStatus,
    addPayment,
    deletePayment,
    deleteAllPayments,
    fetchAllPayments,
  };
}
