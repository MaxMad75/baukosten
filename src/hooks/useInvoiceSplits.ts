import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { InvoicePayment, InvoiceSplit } from '@/lib/types';

export function useInvoiceSplits() {
  const { household } = useAuth();
  const [allSplits, setAllSplits] = useState<InvoiceSplit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllSplits = useCallback(async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_splits')
      .select('*');

    if (!error && data) {
      setAllSplits(data as InvoiceSplit[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  useEffect(() => {
    fetchAllSplits();
  }, [fetchAllSplits]);

  const getSplitsForInvoice = useCallback(
    (invoiceId: string) => allSplits.filter((s) => s.invoice_id === invoiceId),
    [allSplits]
  );

  const saveSplits = async (invoiceId: string, splits: Omit<InvoiceSplit, 'id' | 'created_at' | 'invoice_id'>[]) => {
    // Delete existing
    await supabase.from('invoice_splits').delete().eq('invoice_id', invoiceId);

    if (splits.length === 0) {
      await fetchAllSplits();
      return true;
    }

    const rows = splits.map((s) => ({
      invoice_id: invoiceId,
      profile_id: s.profile_id,
      amount: s.amount,
      percentage: s.percentage,
      split_type: s.split_type,
    }));

    const { error } = await supabase.from('invoice_splits').insert(rows);
    if (error) return false;

    await fetchAllSplits();
    return true;
  };

  return { allSplits, loading, getSplitsForInvoice, saveSplits, fetchAllSplits };
}

/**
 * Returns a Map of profileId -> amount for an invoice.
 * Actual payments are the primary source of truth; splits and
 * paid_by_profile_id serve as fallbacks for legacy data.
 */
export function getEffectivePayerAmounts(
  invoice: { amount: number; is_paid: boolean; paid_by_profile_id: string | null },
  splits: InvoiceSplit[],
  payments: Pick<InvoicePayment, 'profile_id' | 'amount'>[] = []
): Map<string, number> {
  const map = new Map<string, number>();
  if (payments.length > 0) {
    for (const p of payments) {
      map.set(p.profile_id, (map.get(p.profile_id) || 0) + Number(p.amount));
    }
  } else if (splits.length > 0) {
    for (const s of splits) {
      map.set(s.profile_id, (map.get(s.profile_id) || 0) + Number(s.amount));
    }
  } else if (invoice.is_paid && invoice.paid_by_profile_id) {
    map.set(invoice.paid_by_profile_id, Number(invoice.amount));
  }
  return map;
}
