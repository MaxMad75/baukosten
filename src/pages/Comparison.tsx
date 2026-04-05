import React, { useMemo, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useInvoiceSplits } from '@/hooks/useInvoiceSplits';
import { useInvoiceAllocations } from '@/hooks/useInvoiceAllocations';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { useOffers } from '@/hooks/useOffers';
import { Invoice, ArchitectEstimateItem, Offer, OfferItem, TaxStatus } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { getTradeForCode, getTradeLabel, TRADE_NODES } from '@/lib/tradeMapping';
import { Button } from '@/components/ui/button';

const toBrutto = (amount: number, isGross: boolean) => isGross ? amount : amount * 1.19;
const toNetto = (amount: number, isGross: boolean) => isGross ? amount / 1.19 : amount;
const toBruttoTaxStatus = (amount: number, taxStatus: TaxStatus) => taxStatus === 'net' ? amount * 1.19 : amount;
const toNettoTaxStatus = (amount: number, taxStatus: TaxStatus) => taxStatus === 'gross' ? amount / 1.19 : amount;
const taxStatusLabel = (ts: TaxStatus) => ts === 'tax_free' ? 'steuerfrei' : ts === 'gross' ? 'brutto' : 'netto';

interface OfferDetail {
  offer: Offer;
  amount: number;
  is_gross: boolean;
}

interface ComparisonRow {
  code: string;
  name: string;
  estimatedBrutto: number;
  actualBrutto: number;
  difference: number;
  percentage: number;
  estimateItems: ArchitectEstimateItem[];
  invoiceItems: Array<{ invoice: Invoice; allocatedAmount: number }>;
  offerBrutto: number;
  offerItems: OfferDetail[];
  offerVsEstimate: number;
}

interface TradeComparisonGroup {
  tradeId: string;
  tradeLabel: string;
  estimatedBrutto: number;
  actualBrutto: number;
  difference: number;
  percentage: number;
  offerBrutto: number;
  offerVsEstimate: number;
  children: ComparisonRow[];
}

export const Comparison: React.FC = () => {
  const { invoices, loading: invLoading } = useInvoices();
  const { allEstimates, allEstimateItems, allBlocks, versions, activeVersion, loading: estLoading } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const { getSplitsForInvoice } = useInvoiceSplits();
  const { getEffectiveAllocations } = useInvoiceAllocations();
  const { data: profiles } = useHouseholdProfiles();
  const { offers, allOfferItems } = useOffers();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openTradeRows, setOpenTradeRows] = useState<Set<string>>(new Set());
  const { formatAmount } = usePrivacy();
  const [viewMode, setViewMode] = useState<'trades' | 'detail'>('trades');

  // --- Offer selection state ---
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const offersActive = selectedOfferIds.size > 0;

  const toggleOffer = (id: string) => {
    setSelectedOfferIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // --- Single version selector ---
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedVersionId && activeVersion) {
      setSelectedVersionId(activeVersion.id);
    }
  }, [activeVersion, selectedVersionId]);

  const selectedEstimateItems = useMemo(() => {
    if (!selectedVersionId) return [];
    // Block-linked items: block belongs to selected version
    const versionBlockIds = new Set(allBlocks.filter(b => b.version_id === selectedVersionId).map(b => b.id));
    // Legacy items: estimate belongs to selected version
    const versionEstimateIds = new Set(allEstimates.filter(e => e.version_id === selectedVersionId).map(e => e.id));
    return allEstimateItems.filter(i =>
      (i.block_id && versionBlockIds.has(i.block_id)) ||
      (!i.block_id && versionEstimateIds.has(i.estimate_id))
    );
  }, [selectedVersionId, allBlocks, allEstimates, allEstimateItems]);

  const toggleRow = (code: string) => {
    setOpenRows(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleTradeRow = (tradeId: string) => {
    setOpenTradeRows(prev => {
      const next = new Set(prev);
      next.has(tradeId) ? next.delete(tradeId) : next.add(tradeId);
      return next;
    });
  };

  // Build an offer lookup map: offerId → Offer
  const offerMap = useMemo(() => {
    const m = new Map<string, Offer>();
    offers.forEach(o => m.set(o.id, o));
    return m;
  }, [offers]);

  const comparisons = useMemo((): ComparisonRow[] => {
    const allCodes = new Set<string>();
    selectedEstimateItems.forEach(i => allCodes.add(i.kostengruppe_code));

    const actualByCode = new Map<string, Array<{ invoice: Invoice; allocatedAmount: number }>>();

    for (const inv of invoices) {
      const allocs = getEffectiveAllocations(inv);
      for (const alloc of allocs) {
        allCodes.add(alloc.kostengruppe_code);
        const existing = actualByCode.get(alloc.kostengruppe_code) || [];
        existing.push({ invoice: inv, allocatedAmount: alloc.amount });
        actualByCode.set(alloc.kostengruppe_code, existing);
      }
    }

    // Aggregate offer items by code (only selected offers)
    const offerByCode = new Map<string, OfferDetail[]>();
    if (offersActive) {
      for (const item of allOfferItems) {
        if (!selectedOfferIds.has(item.offer_id)) continue;
        allCodes.add(item.kostengruppe_code);
        const offer = offerMap.get(item.offer_id);
        if (!offer) continue;
        const existing = offerByCode.get(item.kostengruppe_code) || [];
        existing.push({ offer, amount: Number(item.amount), is_gross: item.is_gross });
        offerByCode.set(item.kostengruppe_code, existing);
      }
    }

    return Array.from(allCodes).map(code => {
      const kg = getKostengruppeByCode(code);
      const codeEstimates = selectedEstimateItems.filter(i => i.kostengruppe_code === code);
      const codeInvoiceItems = actualByCode.get(code) || [];
      const codeOfferItems = offerByCode.get(code) || [];

      const estimatedBrutto = codeEstimates.reduce((s, i) => s + toBruttoTaxStatus(Number(i.estimated_amount), (i.tax_status as TaxStatus) || (i.is_gross ? 'gross' : 'net')), 0);
      const actualBrutto = codeInvoiceItems.reduce((s, item) => s + toBrutto(item.allocatedAmount, item.invoice.is_gross), 0);
      const difference = actualBrutto - estimatedBrutto;
      const percentage = estimatedBrutto > 0 ? ((difference / estimatedBrutto) * 100) : 0;
      const offerBrutto = codeOfferItems.reduce((s, d) => s + toBrutto(d.amount, d.is_gross), 0);

      const offerVsEstimate = offersActive ? (offerBrutto - estimatedBrutto) : 0;

      return { code, name: kg?.name || code, estimatedBrutto, actualBrutto, difference, percentage, estimateItems: codeEstimates, invoiceItems: codeInvoiceItems, offerBrutto, offerItems: codeOfferItems, offerVsEstimate };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [invoices, selectedEstimateItems, kostengruppen, getEffectiveAllocations, offersActive, allOfferItems, selectedOfferIds, offerMap]);

  // --- Trade-level grouping ---
  const tradeComparisons = useMemo((): TradeComparisonGroup[] => {
    const groupMap = new Map<string, ComparisonRow[]>();

    for (const row of comparisons) {
      const kg = getKostengruppeByCode(row.code);
      const tradeId = getTradeForCode(row.code, kg?.parent_code ?? null);
      const existing = groupMap.get(tradeId) || [];
      existing.push(row);
      groupMap.set(tradeId, existing);
    }

    const groups: TradeComparisonGroup[] = [];

    // First add trade nodes in defined order
    for (const node of TRADE_NODES) {
      const children = groupMap.get(node.id);
      if (!children || children.length === 0) continue;
      groups.push(buildTradeGroup(node.id, children));
      groupMap.delete(node.id);
    }

    // Then add sonstiges if present
    const sonstigesChildren = groupMap.get('sonstiges');
    if (sonstigesChildren && sonstigesChildren.length > 0) {
      groups.push(buildTradeGroup('sonstiges', sonstigesChildren));
    }

    return groups;
  }, [comparisons, getKostengruppeByCode]);

  const totals = useMemo(() => {
    const estimated = comparisons.reduce((s, c) => s + c.estimatedBrutto, 0);
    const actual = comparisons.reduce((s, c) => s + c.actualBrutto, 0);
    const difference = comparisons.reduce((s, c) => s + c.difference, 0);
    const offer = comparisons.reduce((s, c) => s + c.offerBrutto, 0);
    const offerVsEstimate = comparisons.reduce((s, c) => s + c.offerVsEstimate, 0);
    return { estimated, actual, difference, offer, offerVsEstimate };
  }, [comparisons]);

  const formatCurrency = (amount: number) => formatAmount(amount);

  if (invLoading || estLoading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Soll/Ist-Vergleich</h1>
          <p className="text-muted-foreground">
            {viewMode === 'trades'
              ? 'Budget vs. tatsächliche Kosten nach Gewerk (alle Werte brutto inkl. 19% MwSt)'
              : 'Budget vs. tatsächliche Kosten nach DIN 276 (alle Werte brutto inkl. 19% MwSt)'}
          </p>
        </div>

        {/* Version selector */}
        {versions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Vergleichsbasis wählen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Schätzungsversion</span>
                <Select
                  value={selectedVersionId || ''}
                  onValueChange={(val) => setSelectedVersionId(val)}
                >
                  <SelectTrigger className="w-[280px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.is_active && ' (aktiv)'}
                        {v.notes ? ` – ${v.notes}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Offer selector */}
        {offers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Angebote einbeziehen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {offers.map(offer => (
                  <label key={offer.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedOfferIds.has(offer.id)}
                      onCheckedChange={() => toggleOffer(offer.id)}
                    />
                    <span>{offer.company_name} — {offer.title}</span>
                    <span className="text-muted-foreground">({formatCurrency(offer.total_amount)})</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className={`grid gap-4 ${offersActive ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Geschätzt (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.estimated)}</div></CardContent></Card>
          {offersActive && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Angebot (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.offer)}</div></CardContent></Card>
          )}
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tatsächlich (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.actual)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Differenz</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totals.difference > 0 ? 'text-destructive' : 'text-green-600'}`}>{totals.difference > 0 ? '+' : ''}{formatCurrency(totals.difference)}</div></CardContent></Card>
          {offersActive && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Δ Angebot/Soll</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totals.offerVsEstimate > 0 ? 'text-destructive' : totals.offerVsEstimate < 0 ? 'text-green-600' : ''}`}>{totals.offerVsEstimate > 0 ? '+' : ''}{formatCurrency(totals.offerVsEstimate)}</div></CardContent></Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {viewMode === 'trades' ? 'Vergleich nach Gewerk' : 'Vergleich nach Kostengruppe'}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={viewMode === 'trades' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('trades')}
                >
                  Gewerke
                </Button>
                <Button
                  variant={viewMode === 'detail' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('detail')}
                >
                  Detail (DIN 276)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'detail' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Kostengruppe</TableHead>
                    <TableHead className="text-right">Soll (brutto)</TableHead>
                    {offersActive && <TableHead className="text-right">Angebot (brutto)</TableHead>}
                    {offersActive && <TableHead className="text-right">Δ Angebot/Soll</TableHead>}
                    <TableHead className="text-right">Ist (brutto)</TableHead>
                    <TableHead className="text-right">Differenz</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisons.map((c) => (
                    <Collapsible key={c.code} open={openRows.has(c.code)} onOpenChange={() => toggleRow(c.code)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="w-8">
                              {openRows.has(c.code) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono">{c.code}</TableCell>
                            <TableCell>{c.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(c.estimatedBrutto)}</TableCell>
                            {offersActive && (
                              <TableCell className="text-right">
                                {c.offerBrutto > 0 ? formatCurrency(c.offerBrutto) : '–'}
                              </TableCell>
                            )}
                            {offersActive && (
                              <TableCell className={`text-right font-medium ${c.offerVsEstimate > 0 ? 'text-destructive' : c.offerVsEstimate < 0 ? 'text-green-600' : ''}`}>
                                {c.offerBrutto > 0 || c.estimatedBrutto > 0 ? `${c.offerVsEstimate > 0 ? '+' : ''}${formatCurrency(c.offerVsEstimate)}` : '–'}
                              </TableCell>
                            )}
                            <TableCell className="text-right">{formatCurrency(c.actualBrutto)}</TableCell>
                            <TableCell className={`text-right font-medium ${c.difference > 0 ? 'text-destructive' : c.difference < 0 ? 'text-green-600' : ''}`}>{c.difference > 0 ? '+' : ''}{formatCurrency(c.difference)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {c.difference > 0 ? <TrendingUp className="h-4 w-4 text-destructive" /> : c.difference < 0 ? <TrendingDown className="h-4 w-4 text-green-600" /> : <Minus className="h-4 w-4" />}
                                <span className="text-sm">{c.estimatedBrutto > 0 ? `${c.percentage > 0 ? '+' : ''}${c.percentage.toFixed(0)}%` : 'Neu'}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={offersActive ? 9 : 7} className="bg-muted/30 p-0">
                              <DetailPanel row={c} formatCurrency={formatCurrency} getSplitsForInvoice={getSplitsForInvoice} profiles={profiles || []} offersActive={offersActive} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Gewerk</TableHead>
                    <TableHead className="text-right">Soll (brutto)</TableHead>
                    {offersActive && <TableHead className="text-right">Angebot (brutto)</TableHead>}
                    {offersActive && <TableHead className="text-right">Δ Angebot/Soll</TableHead>}
                    <TableHead className="text-right">Ist (brutto)</TableHead>
                    <TableHead className="text-right">Differenz</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeComparisons.map((group) => (
                    <Collapsible key={group.tradeId} open={openTradeRows.has(group.tradeId)} onOpenChange={() => toggleTradeRow(group.tradeId)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50 font-medium">
                            <TableCell className="w-8">
                              {openTradeRows.has(group.tradeId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell>{group.tradeLabel}</TableCell>
                            <TableCell className="text-right">{formatCurrency(group.estimatedBrutto)}</TableCell>
                            {offersActive && (
                              <TableCell className="text-right">
                                {group.offerBrutto > 0 ? formatCurrency(group.offerBrutto) : '–'}
                              </TableCell>
                            )}
                            {offersActive && (
                              <TableCell className={`text-right font-medium ${group.offerVsEstimate > 0 ? 'text-destructive' : group.offerVsEstimate < 0 ? 'text-green-600' : ''}`}>
                                {group.offerBrutto > 0 || group.estimatedBrutto > 0 ? `${group.offerVsEstimate > 0 ? '+' : ''}${formatCurrency(group.offerVsEstimate)}` : '–'}
                              </TableCell>
                            )}
                            <TableCell className="text-right">{formatCurrency(group.actualBrutto)}</TableCell>
                            <TableCell className={`text-right font-medium ${group.difference > 0 ? 'text-destructive' : group.difference < 0 ? 'text-green-600' : ''}`}>{group.difference > 0 ? '+' : ''}{formatCurrency(group.difference)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {group.difference > 0 ? <TrendingUp className="h-4 w-4 text-destructive" /> : group.difference < 0 ? <TrendingDown className="h-4 w-4 text-green-600" /> : <Minus className="h-4 w-4" />}
                                <span className="text-sm">{group.estimatedBrutto > 0 ? `${group.percentage > 0 ? '+' : ''}${group.percentage.toFixed(0)}%` : 'Neu'}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={offersActive ? 8 : 6} className="bg-muted/30 p-0">
                              <div className="p-3 space-y-1">
                                {group.children.map(c => (
                                  <div key={c.code} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                                      <span>{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="w-28 text-right">{formatCurrency(c.estimatedBrutto)}</span>
                                      {offersActive && <span className="w-28 text-right">{c.offerBrutto > 0 ? formatCurrency(c.offerBrutto) : '–'}</span>}
                                      <span className="w-28 text-right">{formatCurrency(c.actualBrutto)}</span>
                                      <span className={`w-28 text-right ${c.difference > 0 ? 'text-destructive' : c.difference < 0 ? 'text-green-600' : ''}`}>
                                        {c.difference > 0 ? '+' : ''}{formatCurrency(c.difference)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

function buildTradeGroup(tradeId: string, children: ComparisonRow[]): TradeComparisonGroup {
  const estimatedBrutto = children.reduce((s, c) => s + c.estimatedBrutto, 0);
  const actualBrutto = children.reduce((s, c) => s + c.actualBrutto, 0);
  const difference = children.reduce((s, c) => s + c.difference, 0);
  const offerBrutto = children.reduce((s, c) => s + c.offerBrutto, 0);
  const offerVsEstimate = children.reduce((s, c) => s + c.offerVsEstimate, 0);
  const percentage = estimatedBrutto > 0 ? ((difference / estimatedBrutto) * 100) : 0;
  return {
    tradeId,
    tradeLabel: getTradeLabel(tradeId),
    estimatedBrutto,
    actualBrutto,
    difference,
    percentage,
    offerBrutto,
    offerVsEstimate,
    children: children.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

function DetailPanel({ row, formatCurrency, getSplitsForInvoice, profiles, offersActive }: {
  row: ComparisonRow;
  formatCurrency: (n: number) => string;
  getSplitsForInvoice: (id: string) => any[];
  profiles: { id: string; name: string }[];
  offersActive: boolean;
}) {
  const estNetto = row.estimateItems.reduce((s, i) => s + toNettoTaxStatus(Number(i.estimated_amount), (i.tax_status as TaxStatus) || (i.is_gross ? 'gross' : 'net')), 0);
  const estBrutto = row.estimatedBrutto;
  const estMwst = estBrutto - estNetto;

  const invNetto = row.invoiceItems.reduce((s, item) => s + toNetto(item.allocatedAmount, item.invoice.is_gross), 0);
  const invBrutto = row.actualBrutto;
  const invMwst = invBrutto - invNetto;

  const offerNetto = row.offerItems.reduce((s, d) => s + toNetto(d.amount, d.is_gross), 0);
  const offerBrutto = row.offerBrutto;
  const offerMwst = offerBrutto - offerNetto;

  const cols = offersActive ? 'md:grid-cols-3' : 'md:grid-cols-2';

  return (
    <div className="p-4 space-y-4">
      <div className={`grid gap-4 ${cols}`}>
        {/* Estimates */}
        <div>
          <h4 className="font-semibold text-sm mb-2">Kostenschätzungen ({row.estimateItems.length})</h4>
          {row.estimateItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Schätzungen vorhanden</p>
          ) : (
            <div className="space-y-1">
              {row.estimateItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{formatCurrency(Number(item.estimated_amount))} <Badge variant="outline" className="ml-1 text-xs">{item.is_gross ? 'brutto' : 'netto'}</Badge></span>
                  {item.notes && <span className="text-muted-foreground truncate ml-2">{item.notes}</span>}
                </div>
              ))}
              <div className="border-t pt-1 mt-2 space-y-0.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span>{formatCurrency(estNetto)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MwSt (19%)</span><span>{formatCurrency(estMwst)}</span></div>
                <div className="flex justify-between font-medium"><span>Brutto</span><span>{formatCurrency(estBrutto)}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Offers — only when active */}
        {offersActive && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Angebote ({row.offerItems.length})</h4>
            {row.offerItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Angebote für diese Kostengruppe</p>
            ) : (
              <div className="space-y-1">
                {row.offerItems.map((d, idx) => (
                  <div key={`${d.offer.id}-${idx}`} className="flex justify-between text-sm">
                    <span>{d.offer.company_name}</span>
                    <span>{formatCurrency(d.amount)} <Badge variant="outline" className="ml-1 text-xs">{d.is_gross ? 'brutto' : 'netto'}</Badge></span>
                  </div>
                ))}
                <div className="border-t pt-1 mt-2 space-y-0.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span>{formatCurrency(offerNetto)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MwSt (19%)</span><span>{formatCurrency(offerMwst)}</span></div>
                  <div className="flex justify-between font-medium"><span>Brutto</span><span>{formatCurrency(offerBrutto)}</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoices */}
        <div>
          <h4 className="font-semibold text-sm mb-2">Rechnungen ({row.invoiceItems.length})</h4>
          {row.invoiceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Rechnungen vorhanden</p>
          ) : (
            <div className="space-y-1">
              {row.invoiceItems.map(({ invoice: inv, allocatedAmount }, idx) => {
                const splits = getSplitsForInvoice(inv.id);
                const isPartial = allocatedAmount !== Number(inv.amount);
                return (
                  <div key={`${inv.id}-${idx}`} className="text-sm">
                    <div className="flex justify-between">
                      <span>
                        {format(new Date(inv.invoice_date), 'dd.MM.yy', { locale: de })} – {inv.company_name}
                      </span>
                      <span className="flex items-center gap-1">
                        {formatCurrency(allocatedAmount)}
                        {isPartial && <Badge variant="outline" className="text-xs">anteilig</Badge>}
                        <Badge variant="outline" className="text-xs">{inv.is_gross ? 'brutto' : 'netto'}</Badge>
                        {inv.status === 'paid' && <Badge variant="secondary" className="text-xs">bezahlt</Badge>}
                        {inv.status === 'partially_paid' && <Badge variant="secondary" className="text-xs">teilw. bezahlt</Badge>}
                      </span>
                    </div>
                    {splits.length > 0 && (
                      <div className="ml-4 text-xs text-muted-foreground">
                        {splits.map((s: any) => {
                          const p = profiles.find(pr => pr.id === s.profile_id);
                          return <span key={s.id} className="mr-2">{p?.name || '?'}: {formatCurrency(Number(s.amount))}</span>;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="border-t pt-1 mt-2 space-y-0.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span>{formatCurrency(invNetto)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MwSt (19%)</span><span>{formatCurrency(invMwst)}</span></div>
                <div className="flex justify-between font-medium"><span>Brutto</span><span>{formatCurrency(invBrutto)}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Comparison;
