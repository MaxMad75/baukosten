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
      .is('deleted_at', null)
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

  /** Rechnungen im Papierkorb (deleted_at gesetzt) */
  const fetchTrashedInvoices = async (): Promise<Invoice[]> => {
    if (!household) return [];
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('household_id', household.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    return (data as Invoice[]) || [];
  };

  const restoreInvoice = async (id: string) => {
    const { error } = await supabase.from('invoices').update({ deleted_at: null }).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Rechnung konnte nicht wiederhergestellt werden', variant: 'destructive' });
      return false;
    }
    await fetchInvoices();
    toast({ title: 'Erfolg', description: 'Rechnung wurde wiederhergestellt' });
    return true;
  };

  /** Endgültig löschen (kaskadiert Zahlungen/Abzüge/Zuordnungen) */
  const purgeInvoice = async (id: string) => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Rechnung konnte nicht endgültig gelöscht werden', variant: 'destructive' });
      return false;
    }
    return true;
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

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
        trade_id: invoiceData.trade_id || null,
        contractor_id: invoiceData.contractor_id || null,
        file_path: invoiceData.file_path || null,
        file_name: invoiceData.file_name || null,
        
        ai_extracted: invoiceData.ai_extracted || false,
        is_gross: invoiceData.is_gross ?? true,
        status: invoiceData.status || 'draft',
        net_amount: invoiceData.net_amount ?? null,
        tax_amount: invoiceData.tax_amount ?? null,
        household_id: household.id,
        created_by_profile_id: profile.id,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Fehler',
        description: error.code === '23505'
          ? 'Eine Rechnung mit dieser Rechnungsnummer existiert bereits für diese Firma.'
          : 'Rechnung konnte nicht erstellt werden',
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
        description: error.code === '23505'
          ? 'Eine Rechnung mit dieser Rechnungsnummer existiert bereits für diese Firma.'
          : 'Rechnung konnte nicht aktualisiert werden',
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

  // Soft delete: 30 Tage im Papierkorb wiederherstellbar
  const deleteInvoice = async (id: string) => {
    const { error } = await supabase
      .from('invoices')
      .update({ deleted_at: new Date().toISOString() })
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
      title: 'In den Papierkorb verschoben',
      description: 'Die Rechnung kann 30 Tage lang wiederhergestellt werden.',
    });
    return true;
  };




  return {
    invoices,
    loading,
    fetchInvoices,
    fetchTrashedInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    restoreInvoice,
    purgeInvoice,
  };
}
