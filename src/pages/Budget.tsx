import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useToast } from '@/hooks/use-toast';
import { useTrades } from '@/hooks/useTrades';
import { useInvoices } from '@/hooks/useInvoices';
import { useContractors, matchContractorByName } from '@/hooks/useContractors';
import { useInvoicePayments } from '@/hooks/useInvoicePayments';
import { useInvoiceDeductions, getPayableAmount } from '@/hooks/useInvoiceDeductions';
import {
  Invoice, TaxStatus, TradeSection, TradeWithEstimates, TRADE_SECTION_LABELS,
} from '@/lib/types';

/**
 * Budget-Seite (SRS 4.1/R1.4): die Gewerke-Tabelle als App-Ersatz für das
 * Architekten-Excel. Pro Gewerk: Schätzung (aktuell + Vorversion), Beauftragt
 * ("günstigste oder beauftragt"; ohne Auftrag wird der Schätzwert kursiv
 * angesetzt, wie im Excel), Abgerechnet (Σ Zahlbeträge der zugeordneten
 * Rechnungen), Bezahlt (Σ Zahlungen), Δ/Ampel gegen die aktuelle Schätzung,
 * realisiertes Skonto und ein abgeleiteter Status. Summen entstehen per
 * Konstruktion: Gewerk → Abschnitt → Gesamt.
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
  rows: BudgetRow[];
  totals: Pick<BudgetRow, 'estimate' | 'prevEstimate' | 'awardedEffective' | 'billed' | 'paid' | 'skontoRealized' | 'prognose' | 'delta'>;
}

const STATUS_BADGE: Record<TradeStatus, { variant: 'outline' | 'secondary' | 'default'; className?: string }> = {
  'offen': { variant: 'outline' },
  'beauftragt': { variant: 'secondary' },
  'in Abrechnung': { variant: 'default' },
  'abgerechnet': { variant: 'outline', className: 'border-green-600 text-green-600' },
};

const Budget: React.FC = () => {
  const { trades, loading: tradesLoading, available } = useTrades();
  const { invoices, loading: invLoading, fetchInvoices } = useInvoices();
  const { contractors } = useContractors();
  const { getTotalPaid } = useInvoicePayments();
  const { getDeductionsForInvoice } = useInvoiceDeductions();
  const { formatAmount } = usePrivacy();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'gross' | 'net'>('gross');
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  /** In die Ansichtseinheit (brutto/netto) umrechnen; tax_free bleibt unverändert. */
  const conv = (amount: number, taxStatus: TaxStatus) => {
    if (viewMode === 'gross') return taxStatus === 'net' ? amount * 1.19 : amount;
    return taxStatus === 'gross' ? amount / 1.19 : amount;
  };
  const invTaxStatus = (inv: Invoice): TaxStatus => (inv.is_gross ? 'gross' : 'net');

  const sections = useMemo((): SectionGroup[] => {
    const rows = trades.map((trade): BudgetRow => {
      const tradeInvoices = invoices.filter(
        (inv) => inv.trade_id === trade.id && inv.status !== 'cancelled'
      );

      const estimate = trade.current_estimate
        ? conv(Number(trade.current_estimate.amount), trade.current_estimate.tax_status)
        : 0;
      const prev = trade.estimates.find((e) => !e.is_current);
      const prevEstimate = prev ? conv(Number(prev.amount), prev.tax_status) : null;

      const awarded = trade.awarded_amount != null
        ? conv(Number(trade.awarded_amount), trade.awarded_tax_status)
        : null;
      const isAwardedFallback = awarded == null;
      const awardedEffective = awarded ?? estimate;

      let billed = 0;
      let paid = 0;
      let skontoRealized = 0;
      for (const inv of tradeInvoices) {
        const deductions = getDeductionsForInvoice(inv.id);
        billed += conv(getPayableAmount(Number(inv.amount), deductions), invTaxStatus(inv));
        paid += conv(getTotalPaid(inv.id), invTaxStatus(inv));
        skontoRealized += deductions
          .filter((d) => d.deduction_type === 'skonto')
          .reduce((s, d) => s + conv(Number(d.amount), invTaxStatus(inv)), 0);
      }

      const skontoExpected = trade.skonto_percent != null && awarded != null && Number(trade.skonto_percent) > 0
        ? (awarded * Number(trade.skonto_percent)) / 100
        : null;

      // Prognose je Gewerk = max(Schätzung, Beauftragt, Abgerechnet) — SRS 4.1
      const prognose = Math.max(estimate, awardedEffective, billed);
      const delta = prognose - estimate;

      let status: TradeStatus;
      if (tradeInvoices.length === 0) {
        status = trade.awarded_amount != null && Number(trade.awarded_amount) > 0 ? 'beauftragt' : 'offen';
      } else {
        status = tradeInvoices.every((inv) => inv.status === 'paid') ? 'abgerechnet' : 'in Abrechnung';
      }

      return {
        trade, estimate, prevEstimate, awarded, awardedEffective, isAwardedFallback,
        billed, paid, skontoRealized, skontoExpected, prognose, delta,
        invoices: tradeInvoices, status,
      };
    });

    const bySection = new Map<TradeSection, BudgetRow[]>();
    for (const row of rows) {
      const list = bySection.get(row.trade.section) || [];
      list.push(row);
      bySection.set(row.trade.section, list);
    }

    return Array.from(bySection.entries())
      .sort(([a], [b]) => a - b)
      .map(([section, sectionRows]) => ({
        section,
        rows: sectionRows,
        totals: {
          estimate: sectionRows.reduce((s, r) => s + r.estimate, 0),
          prevEstimate: sectionRows.reduce((s, r) => s + (r.prevEstimate ?? 0), 0),
          awardedEffective: sectionRows.reduce((s, r) => s + r.awardedEffective, 0),
          billed: sectionRows.reduce((s, r) => s + r.billed, 0),
          paid: sectionRows.reduce((s, r) => s + r.paid, 0),
          skontoRealized: sectionRows.reduce((s, r) => s + r.skontoRealized, 0),
          prognose: sectionRows.reduce((s, r) => s + r.prognose, 0),
          delta: sectionRows.reduce((s, r) => s + r.delta, 0),
        },
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, invoices, getDeductionsForInvoice, getTotalPaid, viewMode]);

  const grandTotals = useMemo(() => ({
    estimate: sections.reduce((s, g) => s + g.totals.estimate, 0),
    awardedEffective: sections.reduce((s, g) => s + g.totals.awardedEffective, 0),
    billed: sections.reduce((s, g) => s + g.totals.billed, 0),
    paid: sections.reduce((s, g) => s + g.totals.paid, 0),
    skontoRealized: sections.reduce((s, g) => s + g.totals.skontoRealized, 0),
    prognose: sections.reduce((s, g) => s + g.totals.prognose, 0),
    delta: sections.reduce((s, g) => s + g.totals.delta, 0),
  }), [sections]);

  const unassigned = useMemo(
    () => invoices.filter((inv) => !inv.trade_id && inv.status !== 'cancelled'),
    [invoices]
  );

  const toggleRow = (id: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const assignInvoice = async (invoiceId: string, tradeId: string) => {
    const { error } = await supabase.from('invoices').update({ trade_id: tradeId }).eq('id', invoiceId);
    if (error) {
      toast({ title: 'Fehler', description: 'Rechnung konnte nicht zugeordnet werden', variant: 'destructive' });
      return;
    }
    await fetchInvoices();
  };

  /**
   * Firma→Gewerk-Regel (SRS 4.1): Rechnungsfirma gegen die Firmen der Gewerke
   * matchen; nur eindeutige Treffer werden zugeordnet, der Rest bleibt zur
   * manuellen Auswahl stehen. Bulk-Update direkt über den Client, um nicht
   * pro Rechnung einen Toast auszulösen.
   */
  const autoAssign = async () => {
    setAssigning(true);
    const byTrade = new Map<string, string[]>();
    let ambiguous = 0;
    let unmatched = 0;

    for (const inv of unassigned) {
      const contractor = matchContractorByName(contractors, inv.company_name);
      const candidates = contractor ? trades.filter((t) => t.contractor_id === contractor.id) : [];
      if (candidates.length === 1) {
        const list = byTrade.get(candidates[0].id) || [];
        list.push(inv.id);
        byTrade.set(candidates[0].id, list);
      } else if (candidates.length > 1) {
        ambiguous += 1;
      } else {
        unmatched += 1;
      }
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
      const rest = ambiguous + unmatched;
      toast({
        title: `${assigned} Rechnung(en) zugeordnet`,
        description: rest > 0 ? `${rest} ohne eindeutige Firma→Gewerk-Zuordnung — bitte manuell auswählen.` : 'Alle Rechnungen sind jetzt einem Gewerk zugeordnet.',
      });
    }
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Budget</h1>
            <p className="text-muted-foreground">
              Gewerke wie im Architekten-Excel — alle Werte {viewMode === 'gross' ? 'brutto inkl. 19 % MwSt' : 'netto'}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant={viewMode === 'gross' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('gross')}>Brutto</Button>
            <Button variant={viewMode === 'net' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('net')}>Netto</Button>
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

            {unassigned.length > 0 && trades.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">Rechnungen ohne Gewerk ({unassigned.length})</CardTitle>
                    <Button size="sm" onClick={autoAssign} disabled={assigning}>
                      {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      <span className="ml-2">Über Firma zuordnen</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {unassigned.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1">
                      <span>
                        {format(new Date(inv.invoice_date), 'dd.MM.yy', { locale: de })} – {inv.company_name}
                        <span className="ml-2 text-muted-foreground">{formatAmount(Number(inv.amount))}</span>
                      </span>
                      <Select onValueChange={(tradeId) => assignInvoice(inv.id, tradeId)}>
                        <SelectTrigger className="w-[260px] h-8 text-sm">
                          <SelectValue placeholder="Gewerk wählen…" />
                        </SelectTrigger>
                        <SelectContent>
                          {trades.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Gewerke</CardTitle></CardHeader>
              <CardContent>
                {trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Noch keine Gewerke angelegt.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Gewerk</TableHead>
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
                            {group.rows.map((row) => {
                              const badge = STATUS_BADGE[row.status];
                              return (
                                <Collapsible key={row.trade.id} open={openRows.has(row.trade.id)} onOpenChange={() => toggleRow(row.trade.id)} asChild>
                                  <>
                                    <CollapsibleTrigger asChild>
                                      <TableRow className="cursor-pointer hover:bg-muted/50">
                                        <TableCell className="w-8">
                                          {openRows.has(row.trade.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </TableCell>
                                        <TableCell>
                                          <div className="font-medium">{row.trade.name}</div>
                                          {row.trade.contractor && (
                                            <div className="text-xs text-muted-foreground">{row.trade.contractor.company_name}</div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">{formatAmount(row.estimate)}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                          {row.prevEstimate != null ? formatAmount(row.prevEstimate) : '–'}
                                        </TableCell>
                                        <TableCell className={`text-right ${row.isAwardedFallback ? 'italic text-muted-foreground' : deltaClass(row.awardedEffective - row.estimate)}`}>
                                          {formatAmount(row.awardedEffective)}
                                        </TableCell>
                                        <TableCell className="text-right">{row.billed > 0 ? formatAmount(row.billed) : '–'}</TableCell>
                                        <TableCell className="text-right">{row.paid > 0 ? formatAmount(row.paid) : '–'}</TableCell>
                                        <TableCell className={`text-right font-medium ${deltaClass(row.delta)}`}>
                                          {row.estimate > 0 || row.delta !== 0 ? formatDelta(row.delta, row.estimate) : '–'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {row.skontoRealized > 0
                                            ? formatAmount(row.skontoRealized)
                                            : row.skontoExpected != null
                                              ? <span className="text-muted-foreground">~{formatAmount(row.skontoExpected)}</span>
                                              : '–'}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={badge.variant} className={badge.className}>{row.status}</Badge>
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent asChild>
                                      <TableRow>
                                        <TableCell colSpan={10} className="bg-muted/30 p-0">
                                          <TradeDetailPanel row={row} formatAmount={formatAmount} conv={conv} />
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleContent>
                                  </>
                                </Collapsible>
                              );
                            })}
                            <TableRow className="bg-muted/20 hover:bg-muted/20 font-medium">
                              <TableCell></TableCell>
                              <TableCell>Zwischensumme</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.estimate)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatAmount(group.totals.prevEstimate ?? 0)}</TableCell>
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
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
};

function TradeDetailPanel({ row, formatAmount, conv }: {
  row: BudgetRow;
  formatAmount: (n: number) => string;
  conv: (amount: number, taxStatus: TaxStatus) => number;
}) {
  return (
    <div className="p-4 grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
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
        {row.trade.skonto_percent != null && Number(row.trade.skonto_percent) > 0 && (
          <div className="text-sm text-muted-foreground">
            Vereinbartes Skonto: {Number(row.trade.skonto_percent).toLocaleString('de-DE')} %
          </div>
        )}
      </div>
      <div>
        <h4 className="font-semibold text-sm mb-1">Rechnungen ({row.invoices.length})</h4>
        {row.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Rechnungen zugeordnet</p>
        ) : (
          <div className="space-y-0.5">
            {row.invoices.map((inv) => (
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
  );
}

export default Budget;
