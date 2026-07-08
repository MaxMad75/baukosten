import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { InvoicePayment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Aggregate payments to a Map of profileId -> total amount.
 * invoice_payments is the single source of truth for "wer hat was gezahlt"
 * (legacy splits/paid_by were backfilled by migration 20260707160000).
 */
export function aggregatePaymentsByProfile(
  payments: Pick<InvoicePayment, 'profile_id' | 'amount'>[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    map.set(p.profile_id, (map.get(p.profile_id) || 0) + Number(p.amount));
  }
  return map;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

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

  // Note: invoice status (status/is_paid/payment_date/paid_by_profile_id)
  // is derived server-side by the trg_recalc_invoice_status trigger on
  // invoice_payments (migration 20260705140000). Callers only need to
  // refetch invoices after payment mutations.

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

    await fetchAllPayments();
    return true;
  };

  const deletePayment = async (paymentId: string) => {
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId);

    if (error) {
      toast({ title: 'Fehler', description: 'Zahlung konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }

    await fetchAllPayments();
    return true;
  };

  const deleteAllPayments = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', invoiceId);

    if (error) return false;

    await fetchAllPayments();
    return true;
  };

  return {
    allPayments,
    loading,
    getPaymentsForInvoice,
    getTotalPaid,
    addPayment,
    deletePayment,
    deleteAllPayments,
    fetchAllPayments,
  };
}
