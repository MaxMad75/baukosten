import React, { useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { CostComparison } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Comparison: React.FC = () => {
  const { invoices, loading: invLoading } = useInvoices();
  const { estimateItems, loading: estLoading } = useEstimates();
  const { kostengruppen, getKostengruppeByCode } = useKostengruppen();

  const comparisons = useMemo((): CostComparison[] => {
    const allCodes = new Set<string>();
    estimateItems.forEach(i => allCodes.add(i.kostengruppe_code));
    invoices.forEach(i => i.kostengruppe_code && allCodes.add(i.kostengruppe_code));

    return Array.from(allCodes).map(code => {
      const kg = getKostengruppeByCode(code);
      const estimated = estimateItems.filter(i => i.kostengruppe_code === code).reduce((s, i) => s + Number(i.estimated_amount), 0);
      const actual = invoices.filter(i => i.kostengruppe_code === code).reduce((s, i) => s + Number(i.amount), 0);
      const difference = actual - estimated;
      const percentage = estimated > 0 ? ((difference / estimated) * 100) : 0;

      return { kostengruppe_code: code, kostengruppe_name: kg?.name || code, estimated, actual, difference, percentage };
    }).sort((a, b) => a.kostengruppe_code.localeCompare(b.kostengruppe_code));
  }, [invoices, estimateItems, kostengruppen]);

  const totals = useMemo(() => ({
    estimated: comparisons.reduce((s, c) => s + c.estimated, 0),
    actual: comparisons.reduce((s, c) => s + c.actual, 0),
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
          <p className="text-muted-foreground">Budget vs. tatsächliche Kosten nach DIN 276</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Geschätzt (Soll)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.estimated)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tatsächlich (Ist)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totals.actual)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Differenz</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totals.difference > 0 ? 'text-destructive' : 'text-green-600'}`}>{totals.difference > 0 ? '+' : ''}{formatCurrency(totals.difference)}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Vergleich nach Kostengruppe</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead><TableHead>Kostengruppe</TableHead><TableHead className="text-right">Soll</TableHead><TableHead className="text-right">Ist</TableHead><TableHead className="text-right">Differenz</TableHead><TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisons.map((c) => (
                  <TableRow key={c.kostengruppe_code}>
                    <TableCell className="font-mono">{c.kostengruppe_code}</TableCell>
                    <TableCell>{c.kostengruppe_name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.estimated)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.actual)}</TableCell>
                    <TableCell className={`text-right font-medium ${c.difference > 0 ? 'text-destructive' : c.difference < 0 ? 'text-green-600' : ''}`}>{c.difference > 0 ? '+' : ''}{formatCurrency(c.difference)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.difference > 0 ? <TrendingUp className="h-4 w-4 text-destructive" /> : c.difference < 0 ? <TrendingDown className="h-4 w-4 text-green-600" /> : <Minus className="h-4 w-4" />}
                        <span className="text-sm">{c.estimated > 0 ? `${c.percentage > 0 ? '+' : ''}${c.percentage.toFixed(0)}%` : 'Neu'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Comparison;
