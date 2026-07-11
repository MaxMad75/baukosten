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
import { EstimateImportDialog } from '@/components/budget/EstimateImportDialog';
import { Loader2, ChevronDown, ChevronRight, Wand2, Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useToast } from '@/hooks/use-toast';
import { useTrades, resolveInvoiceTradeId, resolveInvoiceBlockKey, tradeBlockKey } from '@/hooks/useTrades';
import { useInvoices } from '@/hooks/useInvoices';
import { useDocuments } from '@/hooks/useDocuments';
import { useLoans } from '@/hooks/useLoans';
import { normalizeTradeName } from '@/lib/estimateImport';
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
  explicitBilled: number;
}

interface FirmBlock {
  key: string;
  /** Firmenname; null bei Gewerken ohne Firma (Block = das Gewerk selbst) */
  contractorName: string | null;
  rows: BudgetRow[];
  estimate: number;
  prevEstimate: number;
  awardedEffective: number;
  billed: number;
  paid: number;
  skontoRealized: number;
  skontoExpected: number | null;
  prognose: number;
  delta: number;
  invoices: Invoice[];
  status: TradeStatus;
}

interface SectionGroup {
  section: TradeSection;
  blocks: FirmBlock[];
  totals: Pick<FirmBlock, 'estimate' | 'prevEstimate' | 'awardedEffective' | 'billed' | 'paid' | 'skontoRealized' | 'prognose' | 'delta'>;
}

const STATUS_BADGE: Record<TradeStatus, { variant: 'outline' | 'secondary' | 'default'; className?: string }> = {
  'offen': { variant: 'outline' },
  'beauftragt': { variant: 'secondary' },
  'in Abrechnung': { variant: 'default' },
  'abgerechnet': { variant: 'outline', className: 'border-green-600 text-green-600' },
};

const Budget: React.FC = () => {
  const { trades, loading: tradesLoading, available, createTrade, updateTrade, softDeleteTrade, importEstimateVersion } = useTrades();
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
  // Vergleichsbasis: gegen welche Schätzversion Ampeln/Δ/Prognose rechnen
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [tradeDefaults, setTradeDefaults] = useState<Partial<TradeFormValues> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
        explicitBilled: explicitInvoices.reduce((s, inv) => s + payableOf(inv), 0),
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
    const primarySectionOf = (key: string): TradeSection => {
      const counts = sectionsOfBlock.get(key)!;
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
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
      for (const inv of blockInvoices) {
        const deductions = getDeductionsForInvoice(inv.id);
        billed += conv(getPayableAmount(Number(inv.amount), deductions), invTaxStatus(inv));
        paid += conv(getTotalPaid(inv.id), invTaxStatus(inv));
        skontoRealized += deductions
          .filter((d) => d.deduction_type === 'skonto')
          .reduce((s, d) => s + conv(Number(d.amount), invTaxStatus(inv)), 0);
      }

      // Kredit-Zinsen landen als gezahlte Kosten im Gewerk "Finanzierung"
      // (steuerfrei → keine Brutto/Netto-Umrechnung)
      if (totalInterest > 0 && list.some((t) => t.section === 800 && normalizeTradeName(t.name).includes('finanzierung'))) {
        billed += totalInterest;
        paid += totalInterest;
      }

      const estimate = rows.reduce((s, r) => s + r.estimate, 0);
      const awardedEffective = rows.reduce((s, r) => s + r.awardedEffective, 0);
      const skontoExpectedSum = rows.reduce((s, r) => s + (r.skontoExpected ?? 0), 0);
      const prognose = Math.max(estimate, awardedEffective, billed);

      let status: TradeStatus;
      if (blockInvoices.length === 0 && billed === 0) {
        status = rows.some((r) => r.awarded != null && r.awarded > 0) ? 'beauftragt' : 'offen';
      } else {
        status = blockInvoices.length > 0 && blockInvoices.every((inv) => inv.status === 'paid') ? 'abgerechnet' : 'in Abrechnung';
      }

      const block: FirmBlock = {
        key: mapKey,
        contractorName: rows[0].trade.contractor?.company_name || null,
        rows,
        estimate,
        prevEstimate: rows.reduce((s, r) => s + (r.prevEstimate ?? 0), 0),
        awardedEffective,
        billed,
        paid,
        skontoRealized,
        skontoExpected: skontoExpectedSum > 0 ? skontoExpectedSum : null,
        prognose,
        delta: prognose - estimate,
        invoices: blockInvoices,
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
            awardedEffective: blocks.reduce((s, b) => s + b.awardedEffective, 0),
            billed: blocks.reduce((s, b) => s + b.billed, 0),
            paid: blocks.reduce((s, b) => s + b.paid, 0),
            skontoRealized: blocks.reduce((s, b) => s + b.skontoRealized, 0),
            prognose: blocks.reduce((s, b) => s + b.prognose, 0),
            delta: blocks.reduce((s, b) => s + b.delta, 0),
          },
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, invoices, blockKeyByInvoice, getDeductionsForInvoice, getTotalPaid, viewMode, effectiveBase, totalInterest]);

  const grandTotals = useMemo(() => ({
    estimate: sections.reduce((s, g) => s + g.totals.estimate, 0),
    awardedEffective: sections.reduce((s, g) => s + g.totals.awardedEffective, 0),
    billed: sections.reduce((s, g) => s + g.totals.billed, 0),
    paid: sections.reduce((s, g) => s + g.totals.paid, 0),
    skontoRealized: sections.reduce((s, g) => s + g.totals.skontoRealized, 0),
    prognose: sections.reduce((s, g) => s + g.totals.prognose, 0),
    delta: sections.reduce((s, g) => s + g.totals.delta, 0),
  }), [sections]);

  // Ohne Budget-Zuordnung = Firma der Rechnung hat (noch) kein Gewerk im Budget
  const unassigned = useMemo(
    () => invoices.filter(
      (inv) => inv.status !== 'cancelled' && blockKeyByInvoice.get(inv.id) == null
    ),
    [invoices, blockKeyByInvoice]
  );

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

  const openTradeDialog = (trade: Trade | null, defaults: Partial<TradeFormValues> | null = null) => {
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
    if (editingTrade) {
      return updateTrade(editingTrade.id, values);
    }
    // Neue Gewerke ans Ende ihres Abschnitts sortieren
    const maxSort = Math.max(0, ...trades.filter((t) => t.section === values.section).map((t) => t.sort_order));
    return (await createTrade({ ...values, sort_order: maxSort + 10 })) != null;
  };

  const handleDeleteTrade = async () => {
    if (!deleteTarget) return;
    await softDeleteTrade(deleteTarget.id);
    setDeleteTarget(null);
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

  // Gemeinsame Soll-Zellen einer Gewerk-Zeile (Einzel-Block oder Unterzeile)
  const renderSollCells = (row: BudgetRow) => (
    <>
      <TableCell className="text-right">{formatAmount(row.estimate)}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {row.prevEstimate != null ? formatAmount(row.prevEstimate) : '–'}
      </TableCell>
      <TableCell className={`text-right ${row.isAwardedFallback ? 'italic text-muted-foreground' : deltaClass(row.awardedEffective - row.estimate)}`}>
        {formatAmount(row.awardedEffective)}
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
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Budget (Schätzung)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(grandTotals.estimate)}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Beauftragt</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(grandTotals.awardedEffective)}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Abgerechnet</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(grandTotals.billed)}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Bezahlt</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(grandTotals.paid)}</div></CardContent></Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Prognose</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${deltaClass(grandTotals.delta)}`}>{formatAmount(grandTotals.prognose)}</div>
                  <div className={`text-xs ${deltaClass(grandTotals.delta)}`}>{formatDelta(grandTotals.delta, grandTotals.estimate)} zur Schätzung</div>
                </CardContent>
              </Card>
            </div>

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
                  <CardTitle>Budget nach Firmen und Gewerken</CardTitle>
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
                    {sections.map((group) => (
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
                                <span className={`text-right ${deltaClass(block.awardedEffective - block.estimate)}`}>
                                  {formatAmount(block.awardedEffective)}
                                </span>
                                {block.billed > 0 && (
                                  <>
                                    <span className="text-muted-foreground">Abgerechnet</span>
                                    <span className="text-right">{formatAmount(block.billed)}</span>
                                  </>
                                )}
                                {block.paid > 0 && (
                                  <>
                                    <span className="text-muted-foreground">Bezahlt</span>
                                    <span className="text-right">{formatAmount(block.paid)}</span>
                                  </>
                                )}
                                <span className="text-muted-foreground">Δ Prognose</span>
                                <span className={`text-right ${deltaClass(block.delta)}`}>{formatDelta(block.delta, block.estimate)}</span>
                              </div>
                            </button>
                          );
                        })}
                        <div className="flex justify-between px-1 text-sm font-medium">
                          <span>Zwischensumme beauftragt</span>
                          <span className={deltaClass(group.totals.awardedEffective - group.totals.estimate)}>
                            {formatAmount(group.totals.awardedEffective)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between border-t px-1 pt-3 font-bold">
                      <span>Prognose gesamt</span>
                      <span className={deltaClass(grandTotals.delta)}>{formatAmount(grandTotals.prognose)}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Firma / Gewerk</TableHead>
                          <TableHead className="text-right">Schätzung</TableHead>
                          <TableHead className="text-right">Vorversion</TableHead>
                          <TableHead className="text-right">Beauftragt</TableHead>
                          <TableHead className="text-right">Abgerechnet</TableHead>
                          <TableHead className="text-right">Bezahlt</TableHead>
                          <TableHead className="text-right">Δ Prognose</TableHead>
                          <TableHead className="text-right">Skonto</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sections.map((group) => (
                          <React.Fragment key={group.section}>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={10} className="font-semibold text-sm">
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
                                          {single ? renderSollCells(block.rows[0]) : (
                                            <>
                                              <TableCell className="text-right">{formatAmount(block.estimate)}</TableCell>
                                              <TableCell className="text-right text-muted-foreground">{formatAmount(block.prevEstimate)}</TableCell>
                                              <TableCell className={`text-right ${deltaClass(block.awardedEffective - block.estimate)}`}>
                                                {formatAmount(block.awardedEffective)}
                                              </TableCell>
                                            </>
                                          )}
                                          <TableCell className="text-right">{block.billed > 0 ? formatAmount(block.billed) : '–'}</TableCell>
                                          <TableCell className="text-right">{block.paid > 0 ? formatAmount(block.paid) : '–'}</TableCell>
                                          <TableCell className={`text-right font-medium ${deltaClass(block.delta)}`}>
                                            {block.estimate > 0 || block.delta !== 0 ? formatDelta(block.delta, block.estimate) : '–'}
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
                                        {row.explicitBilled > 0 ? `davon ${formatAmount(row.explicitBilled)}` : '–'}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground">–</TableCell>
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
                              <TableCell className={`text-right ${deltaClass(group.totals.awardedEffective - group.totals.estimate)}`}>{formatAmount(group.totals.awardedEffective)}</TableCell>
                              <TableCell className="text-right">{group.totals.billed > 0 ? formatAmount(group.totals.billed) : '–'}</TableCell>
                              <TableCell className="text-right">{group.totals.paid > 0 ? formatAmount(group.totals.paid) : '–'}</TableCell>
                              <TableCell className={`text-right ${deltaClass(group.totals.delta)}`}>{formatDelta(group.totals.delta, group.totals.estimate)}</TableCell>
                              <TableCell className="text-right">{group.totals.skontoRealized > 0 ? formatAmount(group.totals.skontoRealized) : '–'}</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))}
                        <TableRow className="font-bold border-t-2 hover:bg-transparent">
                          <TableCell></TableCell>
                          <TableCell>Gesamt</TableCell>
                          <TableCell className="text-right">{formatAmount(grandTotals.estimate)}</TableCell>
                          <TableCell className="text-right"></TableCell>
                          <TableCell className={`text-right ${deltaClass(grandTotals.awardedEffective - grandTotals.estimate)}`}>{formatAmount(grandTotals.awardedEffective)}</TableCell>
                          <TableCell className="text-right">{grandTotals.billed > 0 ? formatAmount(grandTotals.billed) : '–'}</TableCell>
                          <TableCell className="text-right">{grandTotals.paid > 0 ? formatAmount(grandTotals.paid) : '–'}</TableCell>
                          <TableCell className={`text-right ${deltaClass(grandTotals.delta)}`}>{formatDelta(grandTotals.delta, grandTotals.estimate)}</TableCell>
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
        <div>
          <h4 className="font-semibold text-sm mb-1">
            Rechnungen {block.contractorName ? `von ${block.contractorName}` : ''} ({block.invoices.length})
          </h4>
          {block.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Rechnungen</p>
          ) : (
            <div className="space-y-0.5">
              {block.invoices.map((inv) => (
                <div key={inv.id} className="flex justify-between text-sm">
                  <span>{format(new Date(inv.invoice_date), 'dd.MM.yy', { locale: de })} – {inv.company_name}</span>
                  <span className="flex items-center gap-1">
                    {formatAmount(Number(inv.amount))}
                    {inv.status === 'paid' && <Badge variant="secondary" className="text-xs">bezahlt</Badge>}
                    {inv.status === 'partially_paid' && <Badge variant="secondary" className="text-xs">teilw. bezahlt</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Budget;
