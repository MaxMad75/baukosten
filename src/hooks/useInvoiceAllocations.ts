import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Invoice, InvoiceAllocation } from '@/lib/types';

interface AllocationInput {
  kostengruppe_code: string;
  estimate_item_id?: string | null;
  amount: number;
  notes?: string | null;
}

export function useInvoiceAllocations() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [allAllocations, setAllAllocations] = useState<InvoiceAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllAllocations = useCallback(async () => {
    if (!household) return;
    setLoading(true);

    // Get all invoice IDs for this household first
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('household_id', household.id);

    if (!invoices || invoices.length === 0) {
      setAllAllocations([]);
      setLoading(false);
      return;
    }

    const invoiceIds = invoices.map(i => i.id);
    const { data, error } = await supabase
      .from('invoice_allocations')
      .select('*')
      .in('invoice_id', invoiceIds);

    if (!error && data) {
      setAllAllocations(data as InvoiceAllocation[]);
    }
    setLoading(false);
  }, [household]);

  useEffect(() => {
    fetchAllAllocations();
  }, [fetchAllAllocations]);

  const getAllocationsForInvoice = useCallback((invoiceId: string): InvoiceAllocation[] => {
    return allAllocations.filter(a => a.invoice_id === invoiceId);
  }, [allAllocations]);

  /**
   * Returns real allocations if any exist, otherwise synthesizes one from the legacy kostengruppe_code.
   */
  const getEffectiveAllocations = useCallback((invoice: Invoice): Array<{ kostengruppe_code: string; estimate_item_id: string | null; amount: number }> => {
    const real = allAllocations.filter(a => a.invoice_id === invoice.id);
    if (real.length > 0) {
      return real.map(a => ({
        kostengruppe_code: a.kostengruppe_code,
        estimate_item_id: a.estimate_item_id,
        amount: Number(a.amount),
      }));
    }
    // Legacy fallback
    if (invoice.kostengruppe_code) {
      return [{ kostengruppe_code: invoice.kostengruppe_code, estimate_item_id: null, amount: Number(invoice.amount) }];
    }
    return [];
  }, [allAllocations]);

  /**
   * Saves allocations for an invoice. Deletes old rows and inserts new ones.
   * Validates sum matches invoice amount and kostengruppe-estimate consistency.
   */
  const saveAllocations = async (
    invoiceId: string,
    allocations: AllocationInput[],
    invoiceAmount: number,
    estimateItems?: Array<{ id: string; kostengruppe_code: string }>
  ): Promise<boolean> => {
    // Validate sum
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(total - invoiceAmount) >= 0.01) {
      toast({
        title: 'Fehler',
        description: 'Die Summe der Zuordnungen stimmt nicht mit dem Rechnungsbetrag überein',
        variant: 'destructive',
      });
      return false;
    }

    // Validate kostengruppe-estimate consistency
    if (estimateItems) {
      for (const alloc of allocations) {
        if (alloc.estimate_item_id) {
          const item = estimateItems.find(ei => ei.id === alloc.estimate_item_id);
          if (item && item.kostengruppe_code !== alloc.kostengruppe_code) {
            toast({
              title: 'Fehler',
              description: `Kostengruppe ${alloc.kostengruppe_code} stimmt nicht mit der Schätzposition überein`,
              variant: 'destructive',
            });
            return false;
          }
        }
      }
    }

    // Delete old allocations
    const { error: delError } = await supabase
      .from('invoice_allocations')
      .delete()
      .eq('invoice_id', invoiceId);

    if (delError) {
      toast({ title: 'Fehler', description: 'Zuordnungen konnten nicht gelöscht werden', variant: 'destructive' });
      return false;
    }

    // Insert new ones
    if (allocations.length > 0) {
      const { error: insError } = await supabase
        .from('invoice_allocations')
        .insert(
          allocations.map(a => ({
            invoice_id: invoiceId,
            kostengruppe_code: a.kostengruppe_code,
            estimate_item_id: a.estimate_item_id || null,
            amount: a.amount,
            notes: a.notes || null,
          }))
        );

      if (insError) {
        toast({ title: 'Fehler', description: 'Zuordnungen konnten nicht gespeichert werden', variant: 'destructive' });
        return false;
      }
    }

    await fetchAllAllocations();
    return true;
  };

  return {
    allAllocations,
    loading,
    fetchAllAllocations,
    getAllocationsForInvoice,
    getEffectiveAllocations,
    saveAllocations,
  };
}
