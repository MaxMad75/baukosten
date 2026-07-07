import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Invoice } from '@/lib/types';
import { Euro, CheckCircle2, Receipt, TrendingUp } from 'lucide-react';

interface Props {
  invoices: Invoice[];
  formatAmount: (n: number) => string;
}

export const InvoiceStatsCards: React.FC<Props> = ({ invoices, formatAmount }) => {
  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const paidAmount = paidInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const openAmount = totalAmount - paidAmount;
  const openCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
          <Euro className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatAmount(totalAmount)}</div>
          <p className="text-xs text-muted-foreground">{invoices.length} Rechnungen</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{formatAmount(paidAmount)}</div>
          <p className="text-xs text-muted-foreground">{paidInvoices.length} Rechnungen</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Offen</CardTitle>
          <Receipt className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-500">{formatAmount(openAmount)}</div>
          <p className="text-xs text-muted-foreground">{openCount} Rechnungen</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bezahlquote</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0}%
          </div>
          <p className="text-xs text-muted-foreground">nach Betrag</p>
        </CardContent>
      </Card>
    </div>
  );
};
