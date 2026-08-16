import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TradeEditDialog, TradeFormValues } from '@/components/budget/TradeEditDialog';
import { AwardedEditDialog, AwardedUpdate } from '@/components/budget/AwardedEditDialog';
import { EstimateImportDialog } from '@/components/budget/EstimateImportDialog';
import { Loader2, ChevronDown, ChevronRight, Wand2, Plus, Pencil, Trash2, Upload, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useToast } from '@/hooks/use-toast';
import { useTrades, resolveInvoiceTradeId, resolveInvoiceBlockKey, tradeBlockKey, isFinancingTrade } from '@/hooks/useTrades';
import { useInvoices } from '@/hooks/useInvoices';
import { useDocuments } from '@/hooks/useDocuments';
import { useLoans } from '@/hooks/useLoans';
import { useContractors, matchContractorByName } from '@/hooks/useContractors';
import { useInvoicePayments } from '@/hooks/useInvoicePayments';
import { useInvoiceDeductions, getPayableAmount } from '@/hooks/useInvoiceDeductions';
import {
  Invoice, TaxStatus, Trade, TradeSection, TradeWithEstimates, TRADE_SECTION_LABELS,
} from '@/lib/types';

/**
 * Budget-Seite (SRS 4.1, User-Feedback 11.07.): Die Leitfrage ist
 * "welcher FIRMA habe ich wieviel bezahlt" — Ist-Werte (Abgerechnet/
 * Bezahlt) werden deshalb auf FIRMEN-Ebene gezählt; die Gewerke einer
 * Firma sind nur die Soll-Aufschlüsselung (Schätzung/Beauftragt) ihres
 * Budgets. Rechnungen müssen NICHT auf Einzel-Gewerke verteilt werden.
 * Firmen mit genau einem Gewerk erscheinen als normale Zeile; Firmen mit
 * mehreren Gewerken als Block (Firmen-Zeile mit Ist, Gewerk-Unterzeilen
 * mit Soll). Summen entstehen per Konstruktion: Block → Abschnitt → Gesamt.
 */

type TradeStatus = 'offen' | 'beauftragt' | 'in Abrechnung' | 'abgerechnet';

interface BudgetRow {
  trade: TradeWithEstimates;
  estimate: number;
  prevEstimate: number | null;
  awarded: number | null;
  /** Beauftragt, ohne Auftrag der angesetzte Schätzwert (Excel: kursiv grün) */
  awardedEffective: number;
  isAwardedFallback: boolean;
  skontoExpected: number | null;
  /** Explizit DIESEM Gewerk zugewiesene Rechnungen ("davon"-Aufschlüsselung) */
  explicitInvoices: Invoice[];
  explicitPaid: number;
}

interface FirmBlock {
  key: string;
  /** Firmenname; null bei Gewerken ohne Firma (Block = das Gewerk selbst) */
  contractorName: string | null;
  rows: BudgetRow[];
  estimate: number;
  prevEstimate: number;
  /** Σ der TATSÄCHLICH beauftragten Summen (Gewerke ohne Auftrag zählen nicht) */
  awardedReal: number;
  /** true, sobald mindestens ein Gewerk des Blocks beauftragt ist */
  hasAward: boolean;
  /** Σ Schätzung der noch NICHT beauftragten Gewerke — möglicher Zusatzbedarf */
  notAwardedEstimate: number;
  billed: number;
  paid: number;
  skontoRealized: number;
  skontoExpected: number | null;
  /** Offen aus dem Auftrag: Beauftragt − Bezahlt; null = nichts beauftragt */
  open: number | null;
  /** Rechnungen des Blocks mit den Werten, die in die Summen eingehen (Nachvollziehbarkeit) */
  invoiceRows: InvoiceRow[];
  status: TradeStatus;
}

/** Eine Rechnung mit exakt den Beträgen, die in die Block-Summen einfließen */
interface InvoiceRow {
  invoice: Invoice;
  /** Zahlbetrag (Betrag − Abzüge), in Ansichtseinheit */
  payable: number;
  /** Σ erfasste Zahlungen, in Ansichtseinheit */
  paid: number;
  /** Status sagt „bezahlt", aber es sind keine Zahlungen erfasst → Summen weichen ab */
  paidWithoutPayments: boolean;
}

interface SectionGroup {
  section: TradeSection;
  blocks: FirmBlock[];
  totals: {
    estimate: number;
    prevEstimate: number;
    awardedReal: number;
    notAwardedEstimate: number;
    billed: number;
    paid: number;
    skontoRealized: number;
    open: number;
  };
}

const STATUS_BADGE: Record<TradeStatus, { variant: 'outline' | 'secondary' | 'default'; className?: string }> = {
  'offen': { variant: 'outline' },
  'beauftragt': { variant: 'secondary' },
  'in Abrechnung': { variant: 'default' },
  'abgerechnet': { variant: 'outline', className: 'border-green-600 text-green-600' },
};

const Budget: React.FC = () => {
  const { trades, loading: tradesLoading, available, createTrade, updateTrade, softDeleteTrade, fetchTrashedTrades, restoreTrade, setTradeEstimate, importEstimateVersion } = useTrades();
  const { invoices, loading: invLoading, fetchInvoices } = useInvoices();
  const { documents } = useDocuments();
  // Kredit-Zinsen (SRS 4.4) zählen als Kosten im Abschnitt-800-Gewerk "Finanzierung"
  const { totalInterest } = useLoans();
  const { contractors } = useContractors();
  const { getTotalPaid } = useInvoicePayments();
  const { getDeductionsForInvoice } = useInvoiceDeductions();
  const { formatAmount } = usePrivacy();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'gross' | 'net'>('gross');
  // Abschnitts-Filter (User-Feedback 16.08.): z. B. nur Bauwerk/Technik/Nebenkosten,
  // um den echten Finanzierungsbedarf ohne Grundstück & Co. zu sehen. In
  // localStorage gemerkt, damit die Auswahl den Seitenwechsel überlebt.
  const [hiddenSections, setHiddenSections] = useState<Set<TradeSection>>(() => {
    try {
      const raw = localStorage.getItem('budget.hiddenSections');
      return raw ? new Set(JSON.parse(raw) as TradeSection[]) : new Set<TradeSection>();
    } catch {
      return new Set<TradeSection>();
    }
  });

  const toggleSection = (section: TradeSection) => {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      try { localStorage.setItem('budget.hiddenSections', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  // Vergleichsbasis: gegen welche Schätzversion Ampeln/Δ/Prognose rechnen
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeWithEstimates | null>(null);
  const [tradeDefaults, setTradeDefaults] = useState<Partial<TradeFormValues> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [awardedTarget, setAwardedTarget] = useState<FirmBlock | null>(null);
  const [trashedTrades, setTrashedTrades] = useState<Trade[]>([]);

  // Gewerke-Papierkorb (30 Tage wiederherstellbar) — lädt bei Änderungen neu
  React.useEffect(() => {
    if (!available) return;
    fetchTrashedTrades().then(setTrashedTrades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, trades.length]);

  /** In die Ansichtseinheit (brutto/netto) umrechnen; tax_free bleibt unverändert. */
  const conv = (amount: number, taxStatus: TaxStatus) => {
    if (viewMode === 'gross') return taxStatus === 'net' ? amount * 1.19 : amount;
    return taxStatus === 'gross' ? amount / 1.19 : amount;
  };
  const invTaxStatus = (inv: Invoice): TaxStatus => (inv.is_gross ? 'gross' : 'net');

  // Alle vorhandenen Schätzversionen (Label + Datum), neueste zuerst
  const versionOptions = useMemo(() => {
    const map = new Map<string, { label: string; date: string | null; isCurrent: boolean }>();
    for (const t of trades) {
      for (const e of t.estimates) {
        const existing = map.get(e.version_label);
        if (!existing) {
          map.set(e.version_label, { label: e.version_label, date: e.estimate_date, isCurrent: e.is_current });
        } else if (e.is_current) {
          existing.isCurrent = true;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [trades]);

  const effectiveBase =
    (baseVersion && versionOptions.some((v) => v.label === baseVersion) ? baseVersion : null) ??
    versionOptions.find((v) => v.isCurrent)?.label ??
    versionOptions[0]?.label ??
    null;

  // Firmen-ID je Rechnung aus dem verknüpften Dokument (stärkstes Signal)
  const contractorByInvoice = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      if (doc.invoice_id && doc.contractor_id && !map.has(doc.invoice_id)) {
        map.set(doc.invoice_id, doc.contractor_id);
      }
    }
    return map;
  }, [documents]);

  // Block-Zuordnung je Rechnung: Firma (bzw. Einzel-Gewerk) — implizit, ohne Klick
  const blockKeyByInvoice = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const inv of invoices) {
      map.set(inv.id, resolveInvoiceBlockKey(trades, inv, contractorByInvoice.get(inv.id)));
    }
    return map;
  }, [invoices, trades, contractorByInvoice]);

  const sections = useMemo((): SectionGroup[] => {
    const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');
    const payableOf = (inv: Invoice) =>
      conv(getPayableAmount(Number(inv.amount), getDeductionsForInvoice(inv.id)), invTaxStatus(inv));

    // Soll je Gewerk
    const rowOf = (trade: TradeWithEstimates): BudgetRow => {
      const baseEstimate =
        (effectiveBase ? trade.estimates.find((e) => e.version_label === effectiveBase) : null) ||
        trade.current_estimate;
      const estimate = baseEstimate ? conv(Number(baseEstimate.amount), baseEstimate.tax_status) : 0;
      const prev = trade.estimates.find((e) => e.version_label !== baseEstimate?.version_label);
      const prevEstimate = prev ? conv(Number(prev.amount), prev.tax_status) : null;
      const awarded = trade.awarded_amount != null
        ? conv(Number(trade.awarded_amount), trade.awarded_tax_status)
        : null;
      const explicitInvoices = activeInvoices.filter((inv) => inv.trade_id === trade.id);
      return {
        trade,
        estimate,
        prevEstimate,
        awarded,
        awardedEffective: awarded ?? estimate,
        isAwardedFallback: awarded == null,
        skontoExpected: trade.skonto_percent != null && awarded != null && Number(trade.skonto_percent) > 0
          ? (awarded * Number(trade.skonto_percent)) / 100
          : null,
        explicitInvoices,
        explicitPaid: explicitInvoices.reduce((s, inv) => s + conv(getTotalPaid(inv.id), invTaxStatus(inv)), 0),
      };
    };

    // Gewerke nach (Abschnitt, Firmen-Block) gruppieren. Hat eine Firma
    // Gewerke in mehreren Abschnitten, zählen ihre Rechnungen im Abschnitt
    // mit den meisten Gewerken (keine Doppelzählung).
    const sectionsOfBlock = new Map<string, Map<TradeSection, number>>();
    for (const t of trades) {
      const key = tradeBlockKey(t);
      const counts = sectionsOfBlock.get(key) || new Map<TradeSection, number>();
      counts.set(t.section, (counts.get(t.section) || 0) + 1);
      sectionsOfBlock.set(key, counts);
    }
    // Hat eine Firma Gewerke in mehreren Abschnitten, zählen ihre Rechnungen
    // genau einmal — bevorzugt in einem SICHTBAREN Abschnitt, damit der Filter
    // keine Ist-Werte verschluckt.
    const primarySectionOf = (key: string): TradeSection => {
      const counts = Array.from(sectionsOfBlock.get(key)!.entries());
      const rank = (s: TradeSection) => (hiddenSections.has(s) ? 1 : 0);
      return counts.sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0] - b[0])[0][0];
    };

    const blockTrades = new Map<string, TradeWithEstimates[]>(); // "section:key" → trades
    for (const t of trades) {
      const mapKey = `${t.section}:${tradeBlockKey(t)}`;
      const list = blockTrades.get(mapKey) || [];
      list.push(t);
      blockTrades.set(mapKey, list);
    }

    const bySection = new Map<TradeSection, FirmBlock[]>();
    for (const [mapKey, list] of blockTrades) {
      const section = Number(mapKey.split(':')[0]) as TradeSection;
      const key = mapKey.slice(mapKey.indexOf(':') + 1);
      const rows = list
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de'))
        .map(rowOf);

      // Ist-Werte der Firma — nur im Primär-Abschnitt des Blocks
      const isPrimary = primarySectionOf(key) === section;
      const blockInvoices = isPrimary
        ? activeInvoices.filter((inv) => blockKeyByInvoice.get(inv.id) === key)
        : [];

      let billed = 0;
      let paid = 0;
      let skontoRealized = 0;
      const invoiceRows: InvoiceRow[] = [];
      for (const inv of blockInvoices) {
        const deductions = getDeductionsForInvoice(inv.id);
        const invPayable = conv(getPayableAmount(Number(inv.amount), deductions), invTaxStatus(inv));
        const rawPaid = getTotalPaid(inv.id);
        const invPaid = conv(rawPaid, invTaxStatus(inv));
        billed += invPayable;
        paid += invPaid;
        skontoRealized += deductions
          .filter((d) => d.deduction_type === 'skonto')
          .reduce((s, d) => s + conv(Number(d.amount), invTaxStatus(inv)), 0);
        invoiceRows.push({
          invoice: inv,
          payable: invPayable,
          paid: invPaid,
          // Alt-/Sonderfall: Rechnung gilt als bezahlt, hat aber keine Zahlungszeile —
          // dann fehlt sie in "Bezahlt", obwohl die Rechnungsliste sie als bezahlt zeigt.
          paidWithoutPayments: (inv.status === 'paid' || inv.is_paid) && rawPaid <= 0.005,
        });
      }

      // Kredit-Zinsen landen als gezahlte Kosten im Gewerk "Finanzierung"
      // (steuerfrei → keine Brutto/Netto-Umrechnung)
      if (totalInterest > 0 && isPrimary && list.some(isFinancingTrade)) {
        billed += totalInterest;
        paid += totalInterest;
      }

      const estimate = rows.reduce((s, r) => s + r.estimate, 0);
      // „Beauftragt" zählt NUR echte Aufträge (User-Feedback 16.08.) — für noch
      // nicht vergebene Gewerke wird die Schätzung getrennt ausgewiesen, damit
      // die offene Summe keine Wunschwerte enthält.
      const hasAward = rows.some((r) => r.awarded != null);
      const awardedReal = rows.reduce((s, r) => s + (r.awarded ?? 0), 0);
      const notAwardedEstimate = rows.reduce((s, r) => s + (r.awarded == null ? r.estimate : 0), 0);
      const skontoExpectedSum = rows.reduce((s, r) => s + (r.skontoExpected ?? 0), 0);

      let status: TradeStatus;
      if (blockInvoices.length === 0 && billed === 0) {
        status = hasAward && awardedReal > 0 ? 'beauftragt' : 'offen';
      } else {
        status = blockInvoices.length > 0 && blockInvoices.every((inv) => inv.status === 'paid') ? 'abgerechnet' : 'in Abrechnung';
      }

      const block: FirmBlock = {
        key: mapKey,
        contractorName: rows[0].trade.contractor?.company_name || null,
        rows,
        estimate,
        prevEstimate: rows.reduce((s, r) => s + (r.prevEstimate ?? 0), 0),
        awardedReal,
        hasAward,
        notAwardedEstimate,
        billed,
        paid,
        skontoRealized,
        skontoExpected: skontoExpectedSum > 0 ? skontoExpectedSum : null,
        open: hasAward ? awardedReal - paid : null,
        invoiceRows,
        status,
      };
      const blocks = bySection.get(section) || [];
      blocks.push(block);
      bySection.set(section, blocks);
    }

    return Array.from(bySection.entries())
      .sort(([a], [b]) => a - b)
      .map(([section, blocks]) => {
        blocks.sort((a, b) => Math.min(...a.rows.map((r) => r.trade.sort_order)) - Math.min(...b.rows.map((r) => r.trade.sort_order)));
        return {
          section,
          blocks,
          totals: {
            estimate: blocks.reduce((s, b) => s + b.estimate, 0),
            prevEstimate: blocks.reduce((s, b) => s + b.prevEstimate, 0),
            awardedReal: blocks.reduce((s, b) => s + b.awardedReal, 0),
            notAwardedEstimate: blocks.reduce((s, b) => s + b.notAwardedEstimate, 0),
            billed: blocks.reduce((s, b) => s + b.billed, 0),
            paid: blocks.reduce((s, b) => s + b.paid, 0),
            skontoRealized: blocks.reduce((s, b) => s + b.skontoRealized, 0),
            open: blocks.reduce((s, b) => s + (b.open ?? 0), 0),
          },
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, invoices, blockKeyByInvoice, getDeductionsForInvoice, getTotalPaid, viewMode, effectiveBase, totalInterest, hiddenSections]);

  /** Alle vorkommenden Abschnitte (für die Filter-Chips) */
  const allSections = useMemo(
    () => Array.from(new Set(trades.map((t) => t.section))).sort((a, b) => a - b),
    [trades]
  );
  const visibleSections = useMemo(
    () => sections.filter((g) => !hiddenSections.has(g.section)),
    [sections, hiddenSections]
  );
  const isFiltered = hiddenSections.size > 0 && allSections.some((s) => hiddenSections.has(s));

  // Summen immer über die SICHTBAREN Abschnitte — der Filter beantwortet
  // „wieviel Geld brauche ich für Bauwerk/Technik/Nebenkosten noch?"
  const grandTotals = useMemo(() => ({
    estimate: visibleSections.reduce((s, g) => s + g.totals.estimate, 0),
    awardedReal: visibleSections.reduce((s, g) => s + g.totals.awardedReal, 0),
    notAwardedEstimate: visibleSections.reduce((s, g) => s + g.totals.notAwardedEstimate, 0),
    billed: visibleSections.reduce((s, g) => s + g.totals.billed, 0),
    paid: visibleSections.reduce((s, g) => s + g.totals.paid, 0),
    skontoRealized: visibleSections.reduce((s, g) => s + g.totals.skontoRealized, 0),
    open: visibleSections.reduce((s, g) => s + g.totals.open, 0),
    awardedCount: visibleSections.reduce((s, g) => s + g.blocks.filter((b) => b.hasAward).length, 0),
    blockCount: visibleSections.reduce((s, g) => s + g.blocks.length, 0),
  }), [visibleSections]);

  // Ohne Budget-Zuordnung = Firma der Rechnung hat (noch) kein Gewerk im Budget
  const unassigned = useMemo(
    () => invoices.filter(
      (inv) => inv.status !== 'cancelled' && blockKeyByInvoice.get(inv.id) == null
    ),
    [invoices, blockKeyByInvoice]
  );

  // Damit „kein Geld verschwindet": unzugeordnete Kosten fließen in die
  // Kennzahlen-Karten ein (identische Definition wie auf dem Dashboard).
  const unassignedTotals = useMemo(() => {
    let billed = 0;
    let paid = 0;
    for (const inv of unassigned) {
      billed += conv(getPayableAmount(Number(inv.amount), getDeductionsForInvoice(inv.id)), invTaxStatus(inv));
      paid += conv(getTotalPaid(inv.id), invTaxStatus(inv));
    }
    return { billed, paid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unassigned, getDeductionsForInvoice, getTotalPaid, viewMode]);

  // Gesamtzeile = Budget-Blöcke + Rechnungen ohne Budget-Zuordnung, damit
  // Karten und Tabellen-Summe dieselbe Zahl zeigen (kein Geld verschwindet).
  // Bei aktivem Abschnitts-Filter bleibt Unzugeordnetes außen vor (es gehört
  // zu keinem Abschnitt) — der Hinweis unter den Karten weist es aus.
  const unassignedInTotals = isFiltered ? 0 : unassignedTotals.paid;
  const paidTotal = grandTotals.paid + unassignedInTotals;
  /** Offen aus erteilten Aufträgen — enthält KEINE noch nicht beauftragten Posten */
  const openTotal = grandTotals.open;
  /** Was laut Kostenberechnung für noch nicht vergebene Posten dazukommen dürfte */
  const notAwardedTotal = grandTotals.notAwardedEstimate;
  /** Realistischer Restbedarf: offene Aufträge + geschätzte noch nicht vergebene Posten */
  const stillNeededTotal = openTotal + notAwardedTotal;

  const unassignedGroups = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of unassigned) {
      const key = inv.company_name.trim();
      const list = map.get(key) || [];
      list.push(inv);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [unassigned]);

  const toggleRow = (id: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /**
   * Implizite eindeutige Zuordnungen festschreiben (trade_id), damit sie
   * auch in der Rechnungsliste sichtbar und stabil gegen Umbenennungen sind.
   */
  const autoAssign = async () => {
    setAssigning(true);
    const byTrade = new Map<string, string[]>();
    for (const inv of invoices) {
      if (inv.trade_id || inv.status === 'cancelled') continue;
      const resolved = resolveInvoiceTradeId(trades, inv, contractorByInvoice.get(inv.id));
      if (!resolved) continue;
      const list = byTrade.get(resolved) || [];
      list.push(inv.id);
      byTrade.set(resolved, list);
    }

    let assigned = 0;
    let failed = false;
    for (const [tradeId, ids] of byTrade) {
      const { error } = await supabase.from('invoices').update({ trade_id: tradeId }).in('id', ids);
      if (error) failed = true; else assigned += ids.length;
    }

    await fetchInvoices();
    setAssigning(false);
    if (failed) {
      toast({ title: 'Fehler', description: 'Nicht alle Rechnungen konnten zugeordnet werden', variant: 'destructive' });
    } else {
      toast({ title: `${assigned} Zuordnung(en) festgeschrieben` });
    }
  };

  const openTradeDialog = (trade: TradeWithEstimates | null, defaults: Partial<TradeFormValues> | null = null) => {
    setEditingTrade(trade);
    setTradeDefaults(defaults);
    setTradeDialogOpen(true);
  };

  /** "Gewerk für Firma anlegen" — Dialog vorbefüllt mit Firma und Namen */
  const openCreateForCompany = (companyName: string) => {
    const contractor = matchContractorByName(contractors, companyName);
    openTradeDialog(null, {
      name: contractor?.trade || companyName,
      contractor_id: contractor?.id || null,
      section: 700,
    });
  };

  const handleTradeSubmit = async (values: TradeFormValues): Promise<boolean> => {
    const { estimate_amount, ...tradeValues } = values;
    let tradeId: string | null = null;
    if (editingTrade) {
      const ok = await updateTrade(editingTrade.id, tradeValues);
      if (!ok) return false;
      tradeId = editingTrade.id;
    } else {
      // Neue Gewerke ans Ende ihres Abschnitts sortieren
      const maxSort = Math.max(0, ...trades.filter((t) => t.section === values.section).map((t) => t.sort_order));
      const created = await createTrade({ ...tradeValues, sort_order: maxSort + 10 });
      if (!created) return false;
      tradeId = created.id;
    }
    // Kostenberechnung des Postens (nur wenn im Dialog geändert)
    if (estimate_amount != null) {
      await setTradeEstimate(tradeId, estimate_amount, values.awarded_tax_status);
    }
    return true;
  };

  const handleDeleteTrade = async () => {
    if (!deleteTarget) return;
    await softDeleteTrade(deleteTarget.id);
    setDeleteTarget(null);
    setTrashedTrades(await fetchTrashedTrades());
  };

  /** Auftragssummen einer Firma speichern — geschrieben wird je Gewerk. */
  const handleAwardedSubmit = async (updates: AwardedUpdate[]): Promise<boolean> => {
    let ok = true;
    for (const u of updates) {
      const current = trades.find((t) => t.id === u.tradeId);
      if (
        current &&
        (current.awarded_amount ?? null) === u.awarded_amount &&
        current.awarded_tax_status === u.awarded_tax_status &&
        (current.awarded_note ?? null) === u.awarded_note
      ) continue; // unverändert
      const success = await updateTrade(u.tradeId, {
        awarded_amount: u.awarded_amount,
        awarded_tax_status: u.awarded_tax_status,
        awarded_note: u.awarded_note,
      });
      if (!success) ok = false;
    }
    if (ok) toast({ title: 'Auftragssummen gespeichert' });
    return ok;
  };

  const deltaClass = (delta: number) =>
    delta > 0.005 ? 'text-destructive' : delta < -0.005 ? 'text-green-600' : '';

  const formatDelta = (delta: number, base: number) => {
    const pct = base > 0 ? ` (${delta > 0 ? '+' : ''}${((delta / base) * 100).toFixed(0)} %)` : '';
    return `${delta > 0 ? '+' : ''}${formatAmount(delta)}${pct}`;
  };

  if (tradesLoading || invLoading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  }

  /** Einheit der Geldwerte — steht an jeder Betragsspalte und an den Karten */
  const unitLabel = viewMode === 'gross' ? 'brutto' : 'netto';
  const moneyHead = (label: string) => (
    <>
      {label}
      <span className="block text-[10px] font-normal text-muted-foreground">{unitLabel}</span>
    </>
  );

  // Gemeinsame Soll-Zellen einer Gewerk-Zeile (Einzel-Block oder Unterzeile)
  const renderSollCells = (row: BudgetRow) => (
    <>
      <TableCell className="text-right">{formatAmount(row.estimate)}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {row.prevEstimate != null ? formatAmount(row.prevEstimate) : '–'}
      </TableCell>
      <TableCell className={`text-right ${row.awarded == null ? 'text-muted-foreground' : deltaClass(row.awarded - row.estimate)}`}>
        {row.awarded == null
          ? <span className="text-xs italic">nicht beauftragt</span>
          : formatAmount(row.awarded)}
      </TableCell>
    </>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Budget</h1>
            <p className="text-muted-foreground">
              Kosten je Firma, Gewerke als Budget-Aufschlüsselung — alle Werte {viewMode === 'gross' ? 'brutto inkl. 19 % MwSt' : 'netto'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {versionOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Vergleichsbasis</span>
                <Select value={effectiveBase || ''} onValueChange={(v) => setBaseVersion(v)}>
                  <SelectTrigger className="h-9 w-[260px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {versionOptions.map((v) => (
                      <SelectItem key={v.label} value={v.label}>
                        {v.label}{v.isCurrent ? ' (aktuell)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-1">
              <Button variant={viewMode === 'gross' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('gross')}>Brutto</Button>
              <Button variant={viewMode === 'net' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('net')}>Netto</Button>
            </div>
          </div>
        </div>

        {/* Abschnitts-Filter: „nur Bauwerk/Technik/Nebenkosten" beantwortet
            die Frage nach dem verbleibenden Finanzierungsbedarf */}
        {available && allSections.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Abschnitte:</span>
            {allSections.map((s) => {
              const active = !hiddenSections.has(s);
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={active ? 'secondary' : 'outline'}
                  className={active ? '' : 'text-muted-foreground line-through'}
                  onClick={() => toggleSection(s)}
                >
                  {s} · {TRADE_SECTION_LABELS[s]}
                </Button>
              );
            })}
            {isFiltered && (
              <Button size="sm" variant="ghost" onClick={() => {
                setHiddenSections(new Set());
                try { localStorage.removeItem('budget.hiddenSections'); } catch { /* ignore */ }
              }}>
                Alle zeigen
              </Button>
            )}
          </div>
        )}

        {!available && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Die Gewerke-Tabellen sind in der Datenbank noch nicht vorhanden (Migration
              20260708130000 ausführen) — die Budget-Ansicht bleibt bis dahin leer.
            </CardContent>
          </Card>
        )}

        {available && (
          <>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Budget (Schätzung)</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{formatAmount(grandTotals.estimate)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Beauftragt (Verträge)</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatAmount(grandTotals.awardedReal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {grandTotals.awardedCount} von {grandTotals.blockCount} Firmen beauftragt
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Bezahlt</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatAmount(paidTotal)}</div>
                  {unassignedInTotals > 0 && (
                    <div className="text-xs text-muted-foreground">davon {formatAmount(unassignedInTotals)} ohne Budget-Zuordnung</div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Offen aus Aufträgen</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${openTotal < -0.005 ? 'text-destructive' : ''}`}>{formatAmount(openTotal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {openTotal < -0.005 ? 'mehr bezahlt als beauftragt' : 'aus erteilten Aufträgen'}
                  </div>
                </CardContent>
              </Card>
              {/* Antwort auf „wieviel Geld brauche ich noch": offene Verträge plus
                  geschätzte Kosten der noch nicht vergebenen Posten */}
              <Card className="border-primary/40">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Voraussichtlich noch nötig</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatAmount(stillNeededTotal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {notAwardedTotal > 0.005
                      ? `davon ${formatAmount(notAwardedTotal)} noch nicht beauftragt (Schätzung)`
                      : 'alle Posten sind beauftragt'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {isFiltered && (
              <p className="text-xs text-muted-foreground">
                Gefiltert: nur {visibleSections.map((g) => g.section).join(', ')} —
                {' '}die Kennzahlen und Summen zeigen ausschließlich diese Abschnitte
                {unassignedTotals.paid > 0
                  ? `; ${formatAmount(unassignedTotals.paid)} bezahlt ohne Budget-Zuordnung sind nicht enthalten.`
                  : '.'}
              </p>
            )}

            {unassigned.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">Rechnungen ohne Budget-Zuordnung ({unassigned.length})</CardTitle>
                    {trades.length > 0 && (
                      <Button size="sm" variant="outline" onClick={autoAssign} disabled={assigning}>
                        {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        <span className="ml-2">Eindeutige festschreiben</span>
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Diese Firmen haben noch kein Gewerk im Budget. „Gewerk anlegen" erstellt den
                    Budgetposten für die Firma — danach zählen ihre Rechnungen automatisch mit.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {unassignedGroups.map(([company, groupInvoices]) => {
                    const groupSum = groupInvoices.reduce((s, inv) => s + Number(inv.amount), 0);
                    return (
                      <div key={company} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {company}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {groupInvoices.length} Rechnung{groupInvoices.length === 1 ? '' : 'en'} · {formatAmount(groupSum)}
                          </span>
                        </span>
                        <Button size="sm" variant="outline" onClick={() => openCreateForCompany(company)}>
                          <Plus className="h-4 w-4" />
                          <span className="ml-2">Gewerk anlegen</span>
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    Budget nach Firmen und Gewerken
                    <Badge variant="outline" className="font-normal">
                      alle Beträge {viewMode === 'gross' ? 'brutto (inkl. 19 % MwSt)' : 'netto'}
                    </Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                      <Upload className="h-4 w-4" />
                      <span className="ml-2">Excel-Import</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openTradeDialog(null)}>
                      <Plus className="h-4 w-4" />
                      <span className="ml-2">Neues Gewerk</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Noch keine Gewerke angelegt.</p>
                ) : (
                  <>
                  {/* Mobile (R2.3): kompakte Karten je Firmen-Block */}
                  <div className="space-y-5 md:hidden">
                    {visibleSections.map((group) => (
                      <div key={group.section} className="space-y-2">
                        <div className="text-sm font-semibold text-muted-foreground">
                          {group.section} · {TRADE_SECTION_LABELS[group.section]}
                        </div>
                        {group.blocks.map((block) => {
                          const badge = STATUS_BADGE[block.status];
                          const single = block.rows.length === 1;
                          return (
                            <button
                              key={block.key}
                              className="w-full rounded-lg border p-3 space-y-1.5 text-left"
                              onClick={() => { if (single) openTradeDialog(block.rows[0].trade); }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium">
                                    {single ? block.rows[0].trade.name : block.contractorName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {single
                                      ? block.contractorName || ''
                                      : block.rows.map((r) => r.trade.name).join(' · ')}
                                  </div>
                                </div>
                                <Badge variant={badge.variant} className={badge.className}>{block.status}</Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                                <span className="text-muted-foreground">Schätzung</span>
                                <span className="text-right">{formatAmount(block.estimate)}</span>
                                <span className="text-muted-foreground">Beauftragt</span>
                                <span className={`text-right ${block.hasAward ? deltaClass(block.awardedReal - block.estimate) : 'italic text-muted-foreground'}`}>
                                  {block.hasAward ? formatAmount(block.awardedReal) : 'nicht beauftragt'}
                                </span>
                                <span className="text-muted-foreground">Bezahlt</span>
                                <span className="text-right">{block.paid > 0 ? formatAmount(block.paid) : '–'}</span>
                                <span className="font-medium">Offen</span>
                                <span className={`text-right font-medium ${(block.open ?? 0) < -0.005 ? 'text-destructive' : ''}`}>
                                  {block.open != null ? formatAmount(block.open) : '–'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                        <div className="space-y-0.5 px-1 text-sm font-medium">
                          <div className="flex justify-between">
                            <span>Zwischensumme beauftragt</span>
                            <span>{formatAmount(group.totals.awardedReal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>… davon bezahlt</span>
                            <span>{formatAmount(group.totals.paid)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>… noch offen</span>
                            <span className={group.totals.open < -0.005 ? 'text-destructive' : ''}>{formatAmount(group.totals.open)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="space-y-0.5 border-t px-1 pt-3 font-bold">
                      <div className="flex justify-between">
                        <span>Beauftragt gesamt</span>
                        <span>{formatAmount(grandTotals.awardedReal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bezahlt gesamt</span>
                        <span>{formatAmount(paidTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Offen aus Aufträgen</span>
                        <span className={openTotal < -0.005 ? 'text-destructive' : ''}>{formatAmount(openTotal)}</span>
                      </div>
                      {notAwardedTotal > 0.005 && (
                        <>
                          <div className="flex justify-between font-normal text-muted-foreground">
                            <span>noch nicht beauftragt (Schätzung)</span>
                            <span>{formatAmount(notAwardedTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Voraussichtlich noch nötig</span>
                            <span>{formatAmount(stillNeededTotal)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Firma / Gewerk</TableHead>
                          <TableHead className="text-right">{moneyHead('Schätzung')}</TableHead>
                          <TableHead className="text-right">{moneyHead('Vorversion')}</TableHead>
                          <TableHead className="text-right">{moneyHead('Beauftragt')}</TableHead>
                          <TableHead className="text-right">{moneyHead('Bezahlt')}</TableHead>
                          <TableHead className="text-right">{moneyHead('Offen')}</TableHead>
                          <TableHead className="text-right">{moneyHead('Skonto')}</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleSections.map((group) => (
                          <React.Fragment key={group.section}>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={9} className="font-semibold text-sm">
                                {group.section} · {TRADE_SECTION_LABELS[group.section]}
                              </TableCell>
                            </TableRow>
                            {group.blocks.map((block) => {
                              const badge = STATUS_BADGE[block.status];
                              const single = block.rows.length === 1;
                              return (
                                <React.Fragment key={block.key}>
                                  <Collapsible open={openRows.has(block.key)} onOpenChange={() => toggleRow(block.key)} asChild>
                                    <>
                                      <CollapsibleTrigger asChild>
                                        <TableRow className="cursor-pointer hover:bg-muted/50">
                                          <TableCell className="w-8">
                                            {openRows.has(block.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                          </TableCell>
                                          <TableCell>
                                            <div className="font-medium">
                                              {single ? block.rows[0].trade.name : block.contractorName}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {single
                                                ? block.contractorName || ''
                                                : `${block.rows.length} Gewerke`}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">{formatAmount(block.estimate)}</TableCell>
                                          <TableCell className="text-right text-muted-foreground">
                                            {block.prevEstimate > 0 ? formatAmount(block.prevEstimate) : '–'}
                                          </TableCell>
                                          {/* Auftragssumme direkt hier pflegbar (Klick öffnet den Auftrags-Dialog der Firma) */}
                                          <TableCell className="text-right">
                                            <button
                                              className={`group inline-flex items-center gap-1 hover:underline ${
                                                block.hasAward ? deltaClass(block.awardedReal - block.estimate) : 'text-muted-foreground'
                                              }`}
                                              onClick={(e) => { e.stopPropagation(); setAwardedTarget(block); }}
                                              title="Auftragssumme(n) bearbeiten"
                                            >
                                              {block.hasAward
                                                ? formatAmount(block.awardedReal)
                                                : <span className="text-xs italic">nicht beauftragt</span>}
                                              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                                            </button>
                                            {block.hasAward && block.notAwardedEstimate > 0.005 && (
                                              <div className="text-[10px] text-muted-foreground">
                                                + {formatAmount(block.notAwardedEstimate)} offen zu vergeben
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">{block.paid > 0 ? formatAmount(block.paid) : '–'}</TableCell>
                                          <TableCell className={`text-right font-medium ${(block.open ?? 0) < -0.005 ? 'text-destructive' : ''}`}>
                                            {block.open != null ? formatAmount(block.open) : '–'}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {block.skontoRealized > 0
                                              ? formatAmount(block.skontoRealized)
                                              : block.skontoExpected != null
                                                ? <span className="text-muted-foreground">~{formatAmount(block.skontoExpected)}</span>
                                                : '–'}
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant={badge.variant} className={badge.className}>{block.status}</Badge>
                                          </TableCell>
                                        </TableRow>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent asChild>
                                        <TableRow>
                                          <TableCell colSpan={10} className="bg-muted/30 p-0">
                                            <BlockDetailPanel
                                              block={block}
                                              formatAmount={formatAmount}
                                              conv={conv}
                                              onEdit={single ? () => openTradeDialog(block.rows[0].trade) : undefined}
                                              onDelete={single ? () => setDeleteTarget(block.rows[0].trade) : undefined}
                                            />
                                          </TableCell>
                                        </TableRow>
                                      </CollapsibleContent>
                                    </>
                                  </Collapsible>
                                  {!single && block.rows.map((row) => (
                                    <TableRow key={row.trade.id} className="hover:bg-muted/30">
                                      <TableCell></TableCell>
                                      <TableCell className="pl-8">
                                        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => openTradeDialog(row.trade)}>
                                          {row.trade.name}
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      </TableCell>
                                      {renderSollCells(row)}
                                      <TableCell className="text-right text-xs text-muted-foreground">
                                        {row.explicitPaid > 0 ? `davon ${formatAmount(row.explicitPaid)}` : '–'}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground">–</TableCell>
                                      <TableCell className="text-right text-muted-foreground">–</TableCell>
                                      <TableCell></TableCell>
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                            <TableRow className="bg-muted/20 hover:bg-muted/20 font-medium">
                              <TableCell></TableCell>
                              <TableCell>Zwischensumme</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.estimate)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatAmount(group.totals.prevEstimate)}</TableCell>
                              <TableCell className="text-right">
                                {formatAmount(group.totals.awardedReal)}
                                {group.totals.notAwardedEstimate > 0.005 && (
                                  <div className="text-[10px] font-normal text-muted-foreground">
                                    + {formatAmount(group.totals.notAwardedEstimate)} offen zu vergeben
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{group.totals.paid > 0 ? formatAmount(group.totals.paid) : '–'}</TableCell>
                              <TableCell className={`text-right ${group.totals.open < -0.005 ? 'text-destructive' : ''}`}>{formatAmount(group.totals.open)}</TableCell>
                              <TableCell className="text-right">{group.totals.skontoRealized > 0 ? formatAmount(group.totals.skontoRealized) : '–'}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))}
                        {/* Bezahltes ohne Budget-Zuordnung sichtbar machen, damit die
                            Gesamtzeile mit den Kennzahlen-Karten übereinstimmt */}
                        {unassignedInTotals > 0 && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell></TableCell>
                            <TableCell className="text-muted-foreground">Ohne Budget-Zuordnung</TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell className="text-right">{formatAmount(unassignedTotals.paid)}</TableCell>
                            <TableCell className="text-right text-destructive">{formatAmount(-unassignedTotals.paid)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                        <TableRow className="font-bold border-t-2 hover:bg-transparent">
                          <TableCell></TableCell>
                          <TableCell>Gesamt</TableCell>
                          <TableCell className="text-right">{formatAmount(grandTotals.estimate)}</TableCell>
                          <TableCell className="text-right"></TableCell>
                          <TableCell className="text-right">
                            {formatAmount(grandTotals.awardedReal)}
                            {notAwardedTotal > 0.005 && (
                              <div className="text-[10px] font-normal text-muted-foreground">
                                + {formatAmount(notAwardedTotal)} offen zu vergeben
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{paidTotal > 0 ? formatAmount(paidTotal) : '–'}</TableCell>
                          <TableCell className={`text-right ${openTotal < -0.005 ? 'text-destructive' : ''}`}>
                            {formatAmount(openTotal)}
                            {notAwardedTotal > 0.005 && (
                              <div className="text-[10px] font-normal text-muted-foreground">
                                {formatAmount(stillNeededTotal)} inkl. Schätzung
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{grandTotals.skontoRealized > 0 ? formatAmount(grandTotals.skontoRealized) : '–'}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  </>
                )}
              </CardContent>
            </Card>
            {trashedTrades.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Papierkorb — Gewerke ({trashedTrades.length})</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    30 Tage wiederherstellbar, danach werden sie endgültig entfernt.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  {trashedTrades.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {t.name}
                        {t.deleted_at && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            gelöscht am {format(new Date(t.deleted_at), 'dd.MM.yyyy', { locale: de })}
                          </span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await restoreTrade(t.id);
                          setTrashedTrades(await fetchTrashedTrades());
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="ml-2">Wiederherstellen</span>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <TradeEditDialog
          open={tradeDialogOpen}
          onOpenChange={(open) => { setTradeDialogOpen(open); if (!open) setTradeDefaults(null); }}
          trade={editingTrade}
          contractors={contractors}
          onSubmit={handleTradeSubmit}
          defaults={tradeDefaults}
        />

        <EstimateImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          trades={trades}
          onImport={importEstimateVersion}
        />

        <AwardedEditDialog
          open={!!awardedTarget}
          onOpenChange={(open) => { if (!open) setAwardedTarget(null); }}
          title={awardedTarget?.contractorName || awardedTarget?.rows[0]?.trade.name || ''}
          trades={awardedTarget?.rows.map((r) => r.trade) || []}
          onSubmit={handleAwardedSubmit}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gewerk löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                „{deleteTarget?.name}" wird in den Papierkorb verschoben (Schätzversionen bleiben erhalten).
                Rechnungen der Firma zählen weiter über die verbleibenden Gewerke bzw. erscheinen
                unter „ohne Budget-Zuordnung".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTrade} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

function BlockDetailPanel({ block, formatAmount, conv, onEdit, onDelete }: {
  block: FirmBlock;
  formatAmount: (n: number) => string;
  conv: (amount: number, taxStatus: TaxStatus) => number;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const single = block.rows.length === 1;
  const row = block.rows[0];
  return (
    <div className="p-4 space-y-3">
      {single && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            <span className="ml-2">Bearbeiten</span>
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            <span className="ml-2">Löschen</span>
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {single ? (
            <>
              <div>
                <h4 className="font-semibold text-sm mb-1">Schätzhistorie</h4>
                {row.trade.estimates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Schätzversionen vorhanden</p>
                ) : (
                  <div className="space-y-0.5">
                    {row.trade.estimates.map((e) => (
                      <div key={e.id} className="flex justify-between text-sm">
                        <span>
                          {e.version_label}
                          {e.is_current && <Badge variant="outline" className="ml-2 text-xs">aktuell</Badge>}
                        </span>
                        <span>{formatAmount(conv(Number(e.amount), e.tax_status))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(row.trade.awarded_note || row.trade.notes) && (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {row.trade.awarded_note && <div>Beauftragt: {row.trade.awarded_note}</div>}
                  {row.trade.notes && <div>{row.trade.notes}</div>}
                </div>
              )}
            </>
          ) : (
            <div>
              <h4 className="font-semibold text-sm mb-1">Budget-Aufschlüsselung ({block.rows.length} Gewerke)</h4>
              <div className="space-y-0.5">
                {block.rows.map((r) => (
                  <div key={r.trade.id} className="flex justify-between text-sm">
                    <span>{r.trade.name}</span>
                    <span className={r.isAwardedFallback ? 'italic text-muted-foreground' : ''}>
                      {formatAmount(r.awardedEffective)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Nachvollziehbarkeit: exakt die Rechnungen und Beträge, die in die
            Zeile oben einfließen — inkl. Hinweis auf Rechnungen, die zwar als
            bezahlt gelten, aber keine erfasste Zahlung haben. */}
        <div>
          <h4 className="font-semibold text-sm mb-1">
            Rechnungen {block.contractorName ? `von ${block.contractorName}` : ''} ({block.invoiceRows.length})
          </h4>
          {block.invoiceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Rechnungen</p>
          ) : (
            <div className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Datum · Rechnung</span>
                <span className="flex gap-4">
                  <span className="w-24 text-right">Zahlbetrag</span>
                  <span className="w-24 text-right">bezahlt</span>
                </span>
              </div>
              {block.invoiceRows.map(({ invoice: inv, payable, paid, paidWithoutPayments }) => (
                <div key={inv.id} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {format(new Date(inv.invoice_date), 'dd.MM.yy', { locale: de })} – {inv.company_name}
                    {inv.invoice_number ? ` · ${inv.invoice_number}` : ''}
                    {paidWithoutPayments && (
                      <Badge variant="outline" className="ml-2 border-amber-500 text-xs text-amber-700">
                        bezahlt ohne erfasste Zahlung
                      </Badge>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-4">
                    <span className="w-24 text-right">{formatAmount(payable)}</span>
                    <span className={`w-24 text-right ${paid < payable - 0.005 ? 'text-muted-foreground' : ''}`}>
                      {formatAmount(paid)}
                    </span>
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t pt-1 text-sm font-medium">
                <span>Summe</span>
                <span className="flex shrink-0 gap-4">
                  <span className="w-24 text-right">{formatAmount(block.billed)}</span>
                  <span className="w-24 text-right">{formatAmount(block.paid)}</span>
                </span>
              </div>
              {block.invoiceRows.some((r) => r.paidWithoutPayments) && (
                <p className="pt-1 text-xs text-amber-700">
                  Markierte Rechnungen gelten als bezahlt, haben aber keine Zahlung erfasst — sie zählen
                  deshalb nicht in „Bezahlt". Im Rechnungs-Dialog eine Zahlung nachtragen.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Budget;
