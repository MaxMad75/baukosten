import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { InvoiceDeduction } from '@/lib/types';

/** Zahlbetrag = Rechnungsbetrag − Summe der Abzüge (nie negativ). */
export function getPayableAmount(invoiceAmount: number, deductions: Pick<InvoiceDeduction, 'amount'>[]): number {
  const total = deductions.reduce((s, d) => s + Number(d.amount), 0);
  return Math.max(Math.round((invoiceAmount - total) * 100) / 100, 0);
}

export function useInvoiceDeductions() {
  const { household } = useAuth();
  // React Query (R5): gemeinsamer Cache, kein Voll-Refetch je Seitenwechsel
  const queryClient = useQueryClient();
  const { data: allDeductions = [], isPending: loading } = useQuery({
    queryKey: ['invoice_deductions', household?.id],
    enabled: !!household,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_deductions')
        .select('*');
      if (error) return [] as InvoiceDeduction[];
      return (data as InvoiceDeduction[]) || [];
    },
  });

  const fetchAllDeductions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoice_deductions'] });
  }, [queryClient]);

  const getDeductionsForInvoice = useCallback(
    (invoiceId: string) => allDeductions.filter((d) => d.invoice_id === invoiceId),
    [allDeductions]
  );

  const saveDeductions = async (
    invoiceId: string,
    deductions: Omit<InvoiceDeduction, 'id' | 'created_at' | 'invoice_id'>[]
  ) => {
    // Delete existing, insert new (same pattern as splits/allocations)
    const { error: delError } = await supabase.from('invoice_deductions').delete().eq('invoice_id', invoiceId);
    if (delError) return false;

    if (deductions.length > 0) {
      const { error } = await supabase.from('invoice_deductions').insert(
        deductions.map((d) => ({
          invoice_id: invoiceId,
          deduction_type: d.deduction_type,
          label: d.label || null,
          is_percentage: d.is_percentage,
          percentage: d.percentage,
          amount: d.amount,
          notes: d.notes || null,
        }))
      );
      if (error) return false;
    }

    await fetchAllDeductions();
    return true;
  };

  return { allDeductions, loading, getDeductionsForInvoice, saveDeductions, fetchAllDeductions };
}
