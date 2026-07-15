import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loan, LoanPayment, LoanShare, LoanWithDetails } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

/**
 * Kredit-Modul (SRS 4.4). Defensiv gegenüber einer noch nicht ausgeführten
 * Migration: fehlen die Tabellen, meldet der Hook available=false und die
 * UI blendet das Feature aus (Arbeitsvereinbarung 8.2).
 */
export function useLoans() {
  const { household } = useAuth();
  const { toast } = useToast();
  // React Query (R5): gemeinsamer Cache, kein Voll-Refetch je Seitenwechsel
  const queryClient = useQueryClient();
  const { data: loansResult, isPending: loading } = useQuery({
    queryKey: ['loans', household?.id],
    enabled: !!household,
    staleTime: 60_000,
    queryFn: async (): Promise<{ loans: LoanWithDetails[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('loans')
        .select('*, loan_shares(*), loan_payments(*)')
        .eq('household_id', household!.id)
        .order('created_at');

      if (error) {
        if (error.code === '42P01') return { loans: [], available: false };
        toast({ title: 'Fehler', description: 'Darlehen konnten nicht geladen werden', variant: 'destructive' });
        return { loans: [], available: true };
      }
      const loans = (data || []).map((row) => {
        const { loan_shares, loan_payments, ...loan } = row as Loan & {
          loan_shares: LoanShare[];
          loan_payments: LoanPayment[];
        };
        return {
          ...loan,
          shares: loan_shares || [],
          payments: [...(loan_payments || [])].sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
        };
      });
      return { loans, available: true };
    },
  });
  const loans = loansResult?.loans ?? [];
  const available = loansResult?.available ?? true;

  const fetchLoans = async () => {
    await queryClient.invalidateQueries({ queryKey: ['loans'] });
  };

  const createLoan = async (data: Partial<Loan> & { name: string }) => {
    if (!household) return null;
    const { data: result, error } = await supabase
      .from('loans')
      .insert({ ...data, household_id: household.id })
      .select()
      .single();
    if (error) {
      toast({ title: 'Fehler', description: 'Darlehen konnte nicht angelegt werden', variant: 'destructive' });
      return null;
    }
    await fetchLoans();
    toast({ title: 'Erfolg', description: 'Darlehen wurde angelegt' });
    return result as Loan;
  };

  const updateLoan = async (id: string, updates: Partial<Loan>) => {
    const { error } = await supabase.from('loans').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Darlehen konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchLoans();
    return true;
  };

  /** Löscht Darlehen inkl. Anteilen und Raten (DB-Kaskade). */
  const deleteLoan = async (id: string) => {
    const { error } = await supabase.from('loans').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Darlehen konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchLoans();
    toast({ title: 'Erfolg', description: 'Darlehen wurde gelöscht' });
    return true;
  };

  /** Anteile komplett ersetzen (gleiche Delete+Insert-Logik wie splits/allocations). */
  const saveShares = async (loanId: string, shares: { profile_id: string; share_percent: number }[]) => {
    const { error: delError } = await supabase.from('loan_shares').delete().eq('loan_id', loanId);
    if (delError) {
      toast({ title: 'Fehler', description: 'Anteile konnten nicht gespeichert werden', variant: 'destructive' });
      return false;
    }
    if (shares.length > 0) {
      const { error } = await supabase
        .from('loan_shares')
        .insert(shares.map((s) => ({ loan_id: loanId, ...s })));
      if (error) {
        toast({ title: 'Fehler', description: 'Anteile konnten nicht gespeichert werden', variant: 'destructive' });
        return false;
      }
    }
    await fetchLoans();
    return true;
  };

  const addPayment = async (
    loanId: string,
    payment: { payment_date: string; total_amount: number; interest_amount: number; principal_amount: number; notes?: string | null }
  ) => {
    const { error } = await supabase.from('loan_payments').insert({ loan_id: loanId, ...payment });
    if (error) {
      toast({ title: 'Fehler', description: 'Rate konnte nicht erfasst werden', variant: 'destructive' });
      return false;
    }
    await fetchLoans();
    toast({ title: 'Erfolg', description: 'Rate wurde erfasst' });
    return true;
  };

  const deletePayment = async (paymentId: string) => {
    const { error } = await supabase.from('loan_payments').delete().eq('id', paymentId);
    if (error) {
      toast({ title: 'Fehler', description: 'Rate konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchLoans();
    return true;
  };

  /** Σ Zinsen über alle Darlehen — echte Baukosten (Gewerk "Finanzierung"). */
  const totalInterest = useMemo(
    () => loans.reduce((s, l) => s + l.payments.reduce((ps, p) => ps + Number(p.interest_amount), 0), 0),
    [loans]
  );

  /**
   * Σ Tilgung je Kreditnehmer (profile_id → Betrag) gemäß loan_shares —
   * Vermögensverschiebung vom virtuellen Mitglied "Kredit" zu den Personen.
   */
  const principalByProfile = useMemo(() => {
    const map = new Map<string, number>();
    for (const loan of loans) {
      const principal = loan.payments.reduce((s, p) => s + Number(p.principal_amount), 0);
      if (principal <= 0) continue;
      for (const share of loan.shares) {
        const amount = (principal * Number(share.share_percent)) / 100;
        map.set(share.profile_id, (map.get(share.profile_id) || 0) + amount);
      }
    }
    return map;
  }, [loans]);

  return {
    loans, loading, available, fetchLoans,
    createLoan, updateLoan, deleteLoan, saveShares, addPayment, deletePayment,
    totalInterest, principalByProfile,
  };
}
