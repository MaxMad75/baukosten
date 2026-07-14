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
 * Erkennung des Zins-Gewerks (SRS 4.4): Kredit-Zinsen landen im
 * Abschnitt-800-Gewerk "Finanzierung". Erkennung über Name ODER die vom
 * Kredit-Modul gesetzte Notiz — damit eine Umbenennung des Gewerks die
 * Zinsen nicht still aus dem Budget verschwinden lässt (Review 12.07.).
 */
export const isFinancingTrade = (t: Pick<Trade, 'section' | 'name'> & { notes?: string | null }): boolean =>
  t.section === 800 && (
    t.name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '').includes('finanzierung') ||
    (t.notes || '').toLowerCase().includes('kredit-zinsen')
  );

/**
 * Firmen-Block (User-Feedback 11.07.): Der Bauherr will primär wissen,
 * WELCHER FIRMA er wieviel bezahlt hat — die Gewerke sind nur die
 * Soll-Aufschlüsselung des Firmen-Budgets. Gewerke derselben Firma bilden
 * deshalb einen Block; Ist-Werte (Rechnungen) werden auf Block-Ebene
 * gezählt und müssen NICHT auf Einzel-Gewerke verteilt werden.
 */
export const tradeBlockKey = (t: Pick<Trade, 'id'> & { contractor_id?: string | null }): string =>
  t.contractor_id ? `c:${t.contractor_id}` : `t:${t.id}`;

/**
 * Block-Zuordnung einer Rechnung: explizites trade_id → Block dieses
 * Gewerks; sonst Firmen-ID des verknüpften Dokuments; sonst Namens-Match —
 * der auch bei Firmen mit MEHREREN Gewerken greift, weil alle Kandidaten
 * derselben Firma im selben Block landen. null = manuelle Wahl nötig.
 */
export function resolveInvoiceBlockKey<
  T extends Pick<Trade, 'id'> & { contractor_id?: string | null; contractor?: Pick<Contractor, 'company_name'> | null }
>(
  trades: T[],
  invoice: { trade_id?: string | null; company_name: string },
  contractorId?: string | null
): string | null {
  if (invoice.trade_id) {
    const t = trades.find((x) => x.id === invoice.trade_id);
    if (t) return tradeBlockKey(t);
  }
  if (contractorId && trades.some((t) => t.contractor_id === contractorId)) {
    return `c:${contractorId}`;
  }
  const { candidates } = suggestTradeForCompany(trades, invoice.company_name);
  if (candidates.length > 0) {
    const keys = new Set(candidates.map(tradeBlockKey));
    if (keys.size === 1) return keys.values().next().value!;
  }
  return null;
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
   * Aktuelle Schätzung EINES Gewerks direkt setzen (User-Bug 12.07.:
   * manuell angelegte Gewerke — Grundstück, Architekt, Notar … — hatten
   * keinen Weg zu einer Kostenberechnung und standen immer „über Budget").
   * Schreibt in die aktuelle Schätzversion des Gewerks, sonst in die
   * aktuelle Version des Haushalts, sonst in „Kostenberechnung (manuell)".
   */
  const setTradeEstimate = async (tradeId: string, amount: number, taxStatus: TaxStatus): Promise<boolean> => {
    const trade = trades.find((t) => t.id === tradeId);
    const householdCurrent = trades.flatMap((t) => t.estimates).find((e) => e.is_current);
    const label = trade?.current_estimate?.version_label
      ?? householdCurrent?.version_label
      ?? 'Kostenberechnung (manuell)';
    const estimateDate = trade?.current_estimate?.estimate_date
      ?? householdCurrent?.estimate_date
      ?? new Date().toISOString().slice(0, 10);

    const { error: resetError } = await supabase
      .from('trade_estimates')
      .update({ is_current: false })
      .eq('trade_id', tradeId);
    if (resetError) {
      toast({ title: 'Fehler', description: 'Schätzung konnte nicht gespeichert werden', variant: 'destructive' });
      return false;
    }

    const { error } = await supabase.from('trade_estimates').upsert(
      { trade_id: tradeId, version_label: label, estimate_date: estimateDate, amount, tax_status: taxStatus, is_current: true },
      { onConflict: 'trade_id,version_label' }
    );
    if (error) {
      toast({ title: 'Fehler', description: 'Schätzung konnte nicht gespeichert werden', variant: 'destructive' });
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

  /**
   * Gewerke im Papierkorb (Review 12.07.: bisher gab es keine Restore-UI).
   * Einträge älter als 30 Tage werden beim Laden endgültig entfernt
   * (gleiche Konvention wie der Rechnungs-Papierkorb; invoices.trade_id
   * wird per FK auf NULL gesetzt).
   */
  const fetchTrashedTrades = async (): Promise<Trade[]> => {
    if (!household) return [];
    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('household_id', household.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    const all = (data as Trade[]) || [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const expired = all.filter((t) => t.deleted_at && new Date(t.deleted_at).getTime() < cutoff);
    if (expired.length > 0) {
      await supabase.from('trades').delete().in('id', expired.map((t) => t.id));
    }
    return all.filter((t) => !expired.includes(t));
  };

  const restoreTrade = async (id: string) => {
    const { error } = await supabase.from('trades').update({ deleted_at: null }).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: 'Gewerk konnte nicht wiederhergestellt werden', variant: 'destructive' });
      return false;
    }
    await fetchTrades();
    toast({ title: 'Erfolg', description: 'Gewerk wurde wiederhergestellt' });
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

  return { trades, loading, available, fetchTrades, createTrade, updateTrade, softDeleteTrade, fetchTrashedTrades, restoreTrade, setTradeEstimate, importEstimateVersion };
}
