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
import { Invoice, ArchitectEstimateItem, Offer, OfferItem } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { usePrivacy } from '@/contexts/PrivacyContext';

const toBrutto = (amount: number, isGross: boolean) => isGross ? amount : amount * 1.19;
const toNetto = (amount: number, isGross: boolean) => isGross ? amount / 1.19 : amount;

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
}

export const Comparison: React.FC = () => {
  const { invoices, loading: invLoading } = useInvoices();
  const { allEstimates, getItemsByEstimateIds, loading: estLoading } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const { getSplitsForInvoice } = useInvoiceSplits();
  const { getEffectiveAllocations } = useInvoiceAllocations();
  const { data: profiles } = useHouseholdProfiles();
  const { offers, allOfferItems } = useOffers();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const { formatAmount } = usePrivacy();

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

  // --- Version selection state ---
  const families = useMemo(() => {
    const map = new Map<string, typeof allEstimates>();
    for (const est of allEstimates) {
      const rootId = est.parent_id || est.id;
      const list = map.get(rootId) || [];
      list.push(est);
      map.set(rootId, list);
    }
    for (const [, versions] of map) {
      versions.sort((a, b) => a.version_number - b.version_number);
    }
    return map;
  }, [allEstimates]);

  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedVersions(prev => {
      const next: Record<string, string> = {};
      for (const [rootId, versions] of families) {
        if (prev[rootId] && versions.some(v => v.id === prev[rootId])) {
          next[rootId] = prev[rootId];
        } else {
          const active = versions.find(v => v.is_active);
          next[rootId] = active ? active.id : versions[versions.length - 1].id;
        }
      }
      return next;
    });
  }, [families]);

  const selectedEstimateItems = useMemo(() => {
    const ids = Object.values(selectedVersions);
    return ids.length > 0 ? getItemsByEstimateIds(ids) : [];
  }, [selectedVersions, getItemsByEstimateIds]);

  const toggleRow = (code: string) => {
    setOpenRows(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
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

      const estimatedBrutto = codeEstimates.reduce((s, i) => s + toBrutto(Number(i.estimated_amount), i.is_gross), 0);
      const actualBrutto = codeInvoiceItems.reduce((s, item) => s + toBrutto(item.allocatedAmount, item.invoice.is_gross), 0);
      const difference = actualBrutto - estimatedBrutto;
      const percentage = estimatedBrutto > 0 ? ((difference / estimatedBrutto) * 100) : 0;
      const offerBrutto = codeOfferItems.reduce((s, d) => s + toBrutto(d.amount, d.is_gross), 0);

      return { code, name: kg?.name || code, estimatedBrutto, actualBrutto, difference, percentage, estimateItems: codeEstimates, invoiceItems: codeInvoiceItems, offerBrutto, offerItems: codeOfferItems };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [invoices, selectedEstimateItems, kostengruppen, getEffectiveAllocations, offersActive, allOfferItems, selectedOfferIds, offerMap]);

  const totals = useMemo(() => ({
    estimated: comparisons.reduce((s, c) => s + c.estimatedBrutto, 0),
    actual: comparisons.reduce((s, c) => s + c.actualBrutto, 0),
    difference: comparisons.reduce((s, c) => s + c.difference, 0),
    offer: comparisons.reduce((s, c) => s + c.offerBrutto, 0),
  }), [comparisons]);

  const formatCurrency = (amount: number) => formatAmount(amount);

  if (invLoading || estLoading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Soll/Ist-Vergleich</h1>
          <p className="text-muted-foreground">Budget vs. tatsächliche Kosten nach DIN 276 (alle Werte brutto inkl. 19% MwSt)</p>
        </div>

        {/* Version selectors */}
        {families.size > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Vergleichsbasis wählen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {Array.from(families).map(([rootId, versions]) => {
                  const rootEst = versions.find(v => v.id === rootId) || versions[0];
                  const label = rootEst.file_name?.replace(/\.[^.]+$/, '') || `Schätzung`;
                  return (
                    <div key={rootId} className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <Select
                        value={selectedVersions[rootId] || ''}
                        onValueChange={(val) => setSelectedVersions(prev => ({ ...prev, [rootId]: val }))}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map(v => (
                            <SelectItem key={v.id} value={v.id}>
                              V{v.version_number}
                              {v.is_active && ' (aktiv)'}
                              {v.notes ? ` – ${v.notes}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
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

        <div className={`grid gap-4 ${offersActive ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Geschätzt (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.estimated)}</div></CardContent></Card>
          {offersActive && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Angebot (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.offer)}</div></CardContent></Card>
          )}
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tatsächlich (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.actual)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Differenz</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totals.difference > 0 ? 'text-destructive' : 'text-green-600'}`}>{totals.difference > 0 ? '+' : ''}{formatCurrency(totals.difference)}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Vergleich nach Kostengruppe</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Kostengruppe</TableHead>
                  <TableHead className="text-right">Soll (brutto)</TableHead>
                  {offersActive && <TableHead className="text-right">Angebot (brutto)</TableHead>}
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
                          <TableCell colSpan={offersActive ? 8 : 7} className="bg-muted/30 p-0">
                            <DetailPanel row={c} formatCurrency={formatCurrency} getSplitsForInvoice={getSplitsForInvoice} profiles={profiles || []} offersActive={offersActive} />
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

function DetailPanel({ row, formatCurrency, getSplitsForInvoice, profiles, offersActive }: {
  row: ComparisonRow;
  formatCurrency: (n: number) => string;
  getSplitsForInvoice: (id: string) => any[];
  profiles: { id: string; name: string }[];
  offersActive: boolean;
}) {
  const estNetto = row.estimateItems.reduce((s, i) => s + toNetto(Number(i.estimated_amount), i.is_gross), 0);
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
