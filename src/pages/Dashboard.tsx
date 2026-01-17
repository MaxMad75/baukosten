import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { 
  FileText, 
  Calculator, 
  BarChart3, 
  Euro, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { estimates, estimateItems, loading: estimatesLoading } = useEstimates();
  const { kostengruppen } = useKostengruppen();

  const loading = invoicesLoading || estimatesLoading;

  // Calculate statistics
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter(i => i.is_paid);
  const unpaidInvoices = invoices.filter(i => !i.is_paid);
  
  const totalActual = invoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = paidInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalUnpaid = unpaidInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
  
  const totalEstimated = estimateItems.reduce((sum, i) => sum + Number(i.estimated_amount), 0);
  const budgetDifference = totalActual - totalEstimated;
  const budgetPercentage = totalEstimated > 0 ? ((totalActual / totalEstimated) * 100) : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Laden...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Übersicht Ihrer Baukosten</p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Gesamtkosten</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalActual)}</div>
              <p className="text-xs text-muted-foreground">
                von {formatCurrency(totalEstimated)} geschätzt
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rechnungen</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalInvoices}</div>
              <p className="text-xs text-muted-foreground">
                {paidInvoices.length} bezahlt, {unpaidInvoices.length} offen
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</div>
              <p className="text-xs text-muted-foreground">
                {paidInvoices.length} Rechnungen
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalUnpaid)}</div>
              <p className="text-xs text-muted-foreground">
                {unpaidInvoices.length} Rechnungen
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Budget Progress */}
        {totalEstimated > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Budgetfortschritt
                {budgetDifference > 0 ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-green-500" />
                )}
              </CardTitle>
              <CardDescription>
                {budgetDifference > 0 
                  ? `${formatCurrency(Math.abs(budgetDifference))} über Budget`
                  : `${formatCurrency(Math.abs(budgetDifference))} unter Budget`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Verbraucht: {formatCurrency(totalActual)}</span>
                  <span>Budget: {formatCurrency(totalEstimated)}</span>
                </div>
                <Progress 
                  value={Math.min(budgetPercentage, 100)} 
                  className={budgetPercentage > 100 ? 'bg-destructive/20' : ''}
                />
                <p className="text-right text-sm text-muted-foreground">
                  {budgetPercentage.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/invoices')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rechnungen
              </CardTitle>
              <CardDescription>Rechnungen hochladen und verwalten</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Zur Rechnungsverwaltung</Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/estimates')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Kostenschätzung
              </CardTitle>
              <CardDescription>Architekten-Kalkulation hochladen</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary">Zur Kostenschätzung</Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/comparison')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Soll/Ist-Vergleich
              </CardTitle>
              <CardDescription>Budget vs. tatsächliche Kosten</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">Zum Vergleich</Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Invoices */}
        {invoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Letzte Rechnungen</CardTitle>
              <CardDescription>Die 5 neuesten Rechnungen</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoices.slice(0, 5).map((invoice) => {
                  const kg = kostengruppen.find(k => k.code === invoice.kostengruppe_code);
                  return (
                    <div 
                      key={invoice.id} 
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{invoice.company_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {kg ? `${kg.code} - ${kg.name}` : 'Keine Kostengruppe'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(Number(invoice.amount))}</p>
                        <p className={`text-sm ${invoice.is_paid ? 'text-green-600' : 'text-orange-600'}`}>
                          {invoice.is_paid ? 'Bezahlt' : 'Offen'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
