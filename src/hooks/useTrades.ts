import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Contractor, TaxStatus, Trade, TradeEstimate, TradeWithEstimates } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

/** "Fa. Mayerbau GmbH" → "mayerbau gmbh" (Vergleichsform) */
const cleanCompanyName = (name: string) =>
  name.toLowerCase().replace(/^\s*(fa\.?|firma)\s+/i, '').replace(/\s+/g, ' ').trim();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** needle kommt als ganzes Wort / ganze Phrase im haystack vor */
const containsWord = (haystack: string, needle: string) =>
  new RegExp(`(^|[^a-z0-9äöüß])${escapeRegExp(needle)}($|[^a-z0-9äöüß])`).test(haystack);

/**
 * Firma→Gewerk-Regel (SRS 4.1): Rechnungsfirma wird DIREKT gegen den
 * Firmennamen der Gewerke gematcht (nicht über den Umweg der contractors-
 * Liste — dort können Dubletten wie "Fa. Mayerbau" neben "Mayerbau GmbH"
 * existieren und die Kette reißt, User-Bug 10.07.2026). Gestufte Regeln,
 * die beste nicht-leere Stufe gewinnt:
 *   1. bereinigte Gleichheit ("Fa."/"Firma"-Präfix entfernt)
 *   2. Wortanfang: einer beginnt mit dem anderen ("Mayerbau Bauunternehmung
 *      GmbH" ↔ "Fa. Mayerbau"; schlägt Wort-Teiltreffer wie "Auer" in
 *      "Kurz&Bauer")
 *   3. ganzes Wort enthalten (Kurzkerne wie "USH")
 * Genau ein Gewerk → automatische Zuordnung; mehrere → candidates für das
 * eingeschränkte Dropdown; keins → leer (manuell aus der Gesamtliste).
 */
export function suggestTradeForCompany<
  T extends Pick<Trade, 'id'> & { contractor_id?: string | null; contractor?: Pick<Contractor, 'company_name'> | null }
>(trades: T[], companyName: string, contractorId?: string | null): { trade: T | null; candidates: T[] } {
  // Stärkstes Signal zuerst: die Firmen-ID (z. B. vom verknüpften Dokument) —
  // exakt, unabhängig von Schreibweisen des Firmennamens.
  if (contractorId) {
    const byId = trades.filter((t) => t.contractor_id === contractorId);
    if (byId.length > 0) return { trade: byId.length === 1 ? byId[0] : null, candidates: byId };
  }

  const company = cleanCompanyName(companyName || '');
  if (!company) return { trade: null, candidates: [] };

  const tiers: [T[], T[], T[]] = [[], [], []];
  for (const t of trades) {
    const contractor = cleanCompanyName(t.contractor?.company_name || '');
    if (!contractor) continue;
    if (contractor === company) {
      tiers[0].push(t);
    } else if (
      (contractor.length >= 3 && company.startsWith(contractor)) ||
      (company.length >= 3 && contractor.startsWith(company))
    ) {
      tiers[1].push(t);
    } else if (containsWord(company, contractor) || containsWord(contractor, company)) {
      tiers[2].push(t);
    }
  }

  const candidates = tiers.find((list) => list.length > 0) || [];
  return { trade: candidates.length === 1 ? candidates[0] : null, candidates };
}

/**
 * Effektive Gewerk-Zuordnung einer Rechnung (SRS 4.1, User-Feedback 11.07.):
 * ein explizit gespeichertes trade_id gewinnt; sonst wird IMPLIZIT über die
 * Firma zugeordnet (nur eindeutige Treffer). Budget und Dashboard füllen
 * sich damit, sobald die Firma am Gewerk hängt — ohne dass jede Rechnung
 * einzeln angeklickt werden muss.
 */
export function resolveInvoiceTradeId<
  T extends Pick<Trade, 'id'> & { contractor_id?: string | null; contractor?: Pick<Contractor, 'company_name'> | null }
>(
  trades: T[],
  invoice: { trade_id?: string | null; company_name: string },
  contractorId?: string | null
): string | null {
  if (invoice.trade_id && trades.some((t) => t.id === invoice.trade_id)) return invoice.trade_id;
  return suggestTradeForCompany(trades, invoice.company_name, contractorId).trade?.id ?? null;
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
