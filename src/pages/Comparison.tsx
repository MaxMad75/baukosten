import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { Invoice, ArchitectEstimateItem } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

const toBrutto = (amount: number, isGross: boolean) => isGross ? amount : amount * 1.19;
const toNetto = (amount: number, isGross: boolean) => isGross ? amount / 1.19 : amount;

interface ComparisonRow {
  code: string;
  name: string;
  estimatedBrutto: number;
  actualBrutto: number;
  difference: number;
  percentage: number;
  estimateItems: ArchitectEstimateItem[];
  invoiceItems: Invoice[];
}

export const Comparison: React.FC = () => {
  const { invoices, loading: invLoading } = useInvoices();
  const { estimateItems, loading: estLoading } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const toggleRow = (code: string) => {
    setOpenRows(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const comparisons = useMemo((): ComparisonRow[] => {
    const allCodes = new Set<string>();
    estimateItems.forEach(i => allCodes.add(i.kostengruppe_code));
    invoices.forEach(i => i.kostengruppe_code && allCodes.add(i.kostengruppe_code));

    return Array.from(allCodes).map(code => {
      const kg = getKostengruppeByCode(code);
      const codeEstimates = estimateItems.filter(i => i.kostengruppe_code === code);
      const codeInvoices = invoices.filter(i => i.kostengruppe_code === code);

      const estimatedBrutto = codeEstimates.reduce((s, i) => s + toBrutto(Number(i.estimated_amount), i.is_gross), 0);
      const actualBrutto = codeInvoices.reduce((s, i) => s + toBrutto(Number(i.amount), i.is_gross), 0);
      const difference = actualBrutto - estimatedBrutto;
      const percentage = estimatedBrutto > 0 ? ((difference / estimatedBrutto) * 100) : 0;

      return { code, name: kg?.name || code, estimatedBrutto, actualBrutto, difference, percentage, estimateItems: codeEstimates, invoiceItems: codeInvoices };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [invoices, estimateItems, kostengruppen]);

  const totals = useMemo(() => ({
    estimated: comparisons.reduce((s, c) => s + c.estimatedBrutto, 0),
    actual: comparisons.reduce((s, c) => s + c.actualBrutto, 0),
    difference: comparisons.reduce((s, c) => s + c.difference, 0),
  }), [comparisons]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

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

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Geschätzt (Brutto)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.estimated)}</div></CardContent></Card>
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
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <DetailPanel row={c} formatCurrency={formatCurrency} />
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

function DetailPanel({ row, formatCurrency }: { row: ComparisonRow; formatCurrency: (n: number) => string }) {
  const estNetto = row.estimateItems.reduce((s, i) => s + toNetto(Number(i.estimated_amount), i.is_gross), 0);
  const estBrutto = row.estimatedBrutto;
  const estMwst = estBrutto - estNetto;

  const invNetto = row.invoiceItems.reduce((s, i) => s + toNetto(Number(i.amount), i.is_gross), 0);
  const invBrutto = row.actualBrutto;
  const invMwst = invBrutto - invNetto;

  return (
    <div className="p-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
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

        {/* Invoices */}
        <div>
          <h4 className="font-semibold text-sm mb-2">Rechnungen ({row.invoiceItems.length})</h4>
          {row.invoiceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Rechnungen vorhanden</p>
          ) : (
            <div className="space-y-1">
              {row.invoiceItems.map(inv => (
                <div key={inv.id} className="flex justify-between text-sm">
                  <span>
                    {format(new Date(inv.invoice_date), 'dd.MM.yy', { locale: de })} – {inv.company_name}
                  </span>
                  <span className="flex items-center gap-1">
                    {formatCurrency(Number(inv.amount))}
                    <Badge variant="outline" className="text-xs">{inv.is_gross ? 'brutto' : 'netto'}</Badge>
                    {inv.is_paid && <Badge variant="secondary" className="text-xs">bezahlt</Badge>}
                  </span>
                </div>
              ))}
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
