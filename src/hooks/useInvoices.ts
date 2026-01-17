import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Invoice } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useInvoices() {
  const { household, profile } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = async () => {
    if (!household) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('household_id', household.id)
      .order('invoice_date', { ascending: false });

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Rechnungen konnten nicht geladen werden',
        variant: 'destructive',
      });
    } else {
      setInvoices((data as Invoice[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
  }, [household]);

  const createInvoice = async (invoiceData: Omit<Partial<Invoice>, 'household_id' | 'created_by_profile_id'> & { amount: number; invoice_date: string; company_name: string }) => {
    if (!household || !profile) return null;

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        amount: invoiceData.amount,
        invoice_date: invoiceData.invoice_date,
        company_name: invoiceData.company_name,
        invoice_number: invoiceData.invoice_number || null,
        description: invoiceData.description || null,
        kostengruppe_code: invoiceData.kostengruppe_code || null,
        file_path: invoiceData.file_path || null,
        file_name: invoiceData.file_name || null,
        is_paid: invoiceData.is_paid || false,
        ai_extracted: invoiceData.ai_extracted || false,
        household_id: household.id,
        created_by_profile_id: profile.id,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Rechnung konnte nicht erstellt werden',
        variant: 'destructive',
      });
      return null;
    }

    await fetchInvoices();
    toast({
      title: 'Erfolg',
      description: 'Rechnung wurde erstellt',
    });
    return data as Invoice;
  };

  const updateInvoice = async (id: string, updates: Partial<Invoice>) => {
    const { error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Rechnung konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
      return false;
    }

    await fetchInvoices();
    toast({
      title: 'Erfolg',
      description: 'Rechnung wurde aktualisiert',
    });
    return true;
  };

  const deleteInvoice = async (id: string) => {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Rechnung konnte nicht gelöscht werden',
        variant: 'destructive',
      });
      return false;
    }

    await fetchInvoices();
    toast({
      title: 'Erfolg',
      description: 'Rechnung wurde gelöscht',
    });
    return true;
  };

  const markAsPaid = async (id: string, paidByProfileId: string, paymentDate: string) => {
    return updateInvoice(id, {
      is_paid: true,
      paid_by_profile_id: paidByProfileId,
      payment_date: paymentDate,
    });
  };

  return {
    invoices,
    loading,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markAsPaid,
  };
}
