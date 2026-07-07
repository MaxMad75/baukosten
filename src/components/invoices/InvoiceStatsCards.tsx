import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Invoice, InvoiceDeduction, InvoicePayment } from '@/lib/types';
import { getPayableAmount } from '@/hooks/useInvoiceDeductions';
import { Euro, CheckCircle2, Receipt, TrendingUp } from 'lucide-react';

export interface InvoiceStats {
  /** Summe der ausgestellten Rechnungsbeträge (ohne stornierte) */
  totalInvoiced: number;
  /** Summe der Abzüge (Skonto, Einbehalte, …) */
  totalDeductions: number;
  /** Summe der Zahlbeträge = Rechnungsbeträge − Abzüge */
  totalPayable: number;
  /** Summe der tatsächlich erfassten Zahlungen */
  totalPaid: number;
  /** Noch zu überweisen = Zahlbetrag − bezahlt */
  totalOpen: number;
  paidCount: number;
  openCount: number;
  invoiceCount: number;
}

/**
 * Statistics over the payable amounts (invoice minus deductions) and the
 * actually recorded payments — with deductions in play the raw invoice
 * amounts would overstate the real cash flow.
 */
export function computeInvoiceStats(
  invoices: Invoice[],
  deductions: InvoiceDeduction[],
  payments: InvoicePayment[]
): InvoiceStats {
  const active = invoices.filter((i) => i.status !== 'cancelled');
  const totalInvoiced = active.reduce((s, i) => s + Number(i.amount), 0);
  const totalPayable = active.reduce(
    (s, i) => s + getPayableAmount(Number(i.amount), deductions.filter((d) => d.invoice_id === i.id)),
    0
  );
  const activeIds = new Set(active.map((i) => i.id));
  const totalPaid = payments
    .filter((p) => activeIds.has(p.invoice_id))
    .reduce((s, p) => s + Number(p.amount), 0);

  return {
    totalInvoiced,
    totalDeductions: Math.round((totalInvoiced - totalPayable) * 100) / 100,
    totalPayable,
    totalPaid,
    totalOpen: Math.max(Math.round((totalPayable - totalPaid) * 100) / 100, 0),
    paidCount: active.filter((i) => i.status === 'paid').length,
    openCount: active.filter((i) => i.status !== 'paid').length,
    invoiceCount: invoices.length,
  };
}

interface Props {
  invoices: Invoice[];
  deductions: InvoiceDeduction[];
  payments: InvoicePayment[];
  formatAmount: (n: number) => string;
}

export const InvoiceStatsCards: React.FC<Props> = ({ invoices, deductions, payments, formatAmount }) => {
  const stats = computeInvoiceStats(invoices, deductions, payments);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
          <Euro className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatAmount(stats.totalPayable)}</div>
          <p className="text-xs text-muted-foreground">
            {stats.totalDeductions > 0.005
              ? `${formatAmount(stats.totalInvoiced)} Rechnungen − ${formatAmount(stats.totalDeductions)} Abzüge`
              : `${stats.invoiceCount} Rechnungen`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{formatAmount(stats.totalPaid)}</div>
          <p className="text-xs text-muted-foreground">{stats.paidCount} Rechnungen vollständig bezahlt</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Offen</CardTitle>
          <Receipt className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-500">{formatAmount(stats.totalOpen)}</div>
          <p className="text-xs text-muted-foreground">{stats.openCount} Rechnungen</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bezahlquote</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalPayable > 0 ? Math.round((stats.totalPaid / stats.totalPayable) * 100) : 0}%
          </div>
          <p className="text-xs text-muted-foreground">vom Zahlbetrag</p>
        </CardContent>
      </Card>
    </div>
  );
};
