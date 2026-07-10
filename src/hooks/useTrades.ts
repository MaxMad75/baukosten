import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Contractor, TaxStatus, Trade, TradeEstimate, TradeWithEstimates } from '@/lib/types';
import { matchContractorByName } from '@/hooks/useContractors';
import { useToast } from '@/hooks/use-toast';

/**
 * Firma→Gewerk-Regel (SRS 4.1): deterministische Zuordnung einer Rechnung
 * über ihre Firma. Genau ein Gewerk der gematchten Firma → dieses Gewerk
 * (gleiche Firma ⇒ immer gleiches Gewerk ⇒ konsistent). Mehrere Gewerke →
 * candidates für ein eingeschränktes Dropdown. Unbekannte Firma → leer.
 */
export function suggestTradeForCompany<T extends Pick<Trade, 'id' | 'contractor_id'>>(
  trades: T[],
  contractors: Contractor[],
  companyName: string
): { trade: T | null; candidates: T[] } {
  const contractor = matchContractorByName(contractors, companyName);
  if (!contractor) return { trade: null, candidates: [] };
  const candidates = trades.filter((t) => t.contractor_id === contractor.id);
  return { trade: candidates.length === 1 ? candidates[0] : null, candidates };
}

/**
 * Gewerke (SRS 4.1): zentrale Budgetposten, wie die Zeilen im
 * Architekten-Excel. Defensiv gegenüber einer noch nicht ausgeführten
 * Migration: fehlen die Tabellen, meldet der Hook available=false und
 * die aufrufende Seite blendet das Feature aus (Arbeitsvereinbarung 8.2).
 */
export function useTrades() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [trades, setTrades] = useState<TradeWithEstimates[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const fetchTrades = async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('trades')
      .select('*, trade_estimates(*), contractor:contractors(*)')
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('section')
      .order('sort_order')
      .order('name');

    if (error) {
      // 42P01 = Tabelle existiert (noch) nicht → Feature ausblenden statt Fehler
      if (error.code === '42P01') {
        setAvailable(false);
      } else {
        toast({ title: 'Fehler', description: 'Gewerke konnten nicht geladen werden', variant: 'destructive' });
      }
    } else {
      setAvailable(true);
      const withEstimates = (data || []).map((row) => {
        const { trade_estimates, ...trade } = row as Trade & {
          trade_estimates: TradeEstimate[];
          contractor: TradeWithEstimates['contractor'];
        };
        const estimates = [...(trade_estimates || [])].sort((a, b) =>
          (b.estimate_date || '').localeCompare(a.estimate_date || '')
        );
        return {
          ...trade,
          estimates,
          current_estimate: estimates.find((e) => e.is_current) || null,
        } as TradeWithEstimates;
      });
      setTrades(withEstimates);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  const createTrade = async (data: {
    name: string;
    section: Trade['section'];
    contractor_id?: string | null;
    skonto_percent?: number | null;
    awarded_amount?: number | null;
    awarded_tax_status?: Trade['awarded_tax_status'];
    awarded_note?: string | null;
    sort_order?: number;
    notes?: string | null;
  }) => {
    if (!household) return null;
    const { data: result, error } = await supabase
      .from('trades')
      .insert({ household_id: household.id, ...data })
      .select()
      .single();

    if (error) {
      const isDuplicate = error.code === '23505';
      toast({
        title: 'Fehler',
        description: isDuplicate
          ? 'Ein Gewerk mit diesem Namen existiert bereits'
          : 'Gewerk konnte nicht erstellt werden',
        variant: 'destructive',
      });
      return null;
    }
    await fetchTrades();
    toast({ title: 'Erfolg', description: 'Gewerk wurde angelegt' });
    return result as Trade;
  };

  const updateTrade = async (id: string, updates: Partial<Trade>) => {
    const { error } = await supabase
      .from('trades')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Gewerk konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchTrades();
    return true;
  };

  /**
   * Neue Schätzversion für viele Gewerke in einem Schritt (Excel-Import,
   * SRS R1.5). Idempotent über UNIQUE(trade_id, version_label): erneuter
   * Import mit gleichem Versions-Label überschreibt die Werte. is_current
   * wird vorher nur für die betroffenen Gewerke zurückgesetzt.
   */
  const importEstimateVersion = async (
    entries: { trade_id: string; amount: number }[],
    meta: { version_label: string; estimate_date: string | null; is_current: boolean; tax_status: TaxStatus }
  ): Promise<boolean> => {
    if (entries.length === 0) return false;

    if (meta.is_current) {
      const { error } = await supabase
        .from('trade_estimates')
        .update({ is_current: false })
        .in('trade_id', entries.map((e) => e.trade_id));
      if (error) {
        toast({ title: 'Fehler', description: 'Bisherige Schätzversionen konnten nicht zurückgesetzt werden', variant: 'destructive' });
        return false;
      }
    }

    const { error } = await supabase.from('trade_estimates').upsert(
      entries.map((e) => ({
        trade_id: e.trade_id,
        version_label: meta.version_label,
        estimate_date: meta.estimate_date,
        amount: e.amount,
        tax_status: meta.tax_status,
        is_current: meta.is_current,
      })),
      { onConflict: 'trade_id,version_label' }
    );

    if (error) {
      toast({ title: 'Fehler', description: 'Schätzversion konnte nicht importiert werden', variant: 'destructive' });
      return false;
    }
    await fetchTrades();
    toast({ title: 'Erfolg', description: `${entries.length} Schätzwerte als „${meta.version_label}" importiert` });
    return true;
  };

  /** Papierkorb-Logik wie bei Rechnungen: nur markieren, nicht löschen. */
  const softDeleteTrade = async (id: string) => {
    const { error } = await supabase
      .from('trades')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Gewerk konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchTrades();
    toast({ title: 'Erfolg', description: 'Gewerk wurde in den Papierkorb verschoben' });
    return true;
  };

  return { trades, loading, available, fetchTrades, createTrade, updateTrade, softDeleteTrade, importEstimateVersion };
}
