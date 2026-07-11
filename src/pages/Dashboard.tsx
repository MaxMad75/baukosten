import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { useTrades, resolveInvoiceBlockKey, tradeBlockKey } from '@/hooks/useTrades';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvoiceDeductions, getPayableAmount } from '@/hooks/useInvoiceDeductions';
import { useInvoicePayments } from '@/hooks/useInvoicePayments';
import { useLoans } from '@/hooks/useLoans';
import { normalizeTradeName } from '@/lib/estimateImport';
import {
  FileText, Wallet, FolderOpen, Euro, CheckCircle2, AlertCircle,
  TrendingUp, TrendingDown, ArrowRight, Receipt
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { Invoice, TaxStatus } from '@/lib/types';

const toGross = (amount: number, taxStatus: TaxStatus) => (taxStatus === 'net' ? amount * 1.19 : amount);
const invTaxStatus = (inv: Invoice): TaxStatus => (inv.is_gross ? 'gross' : 'net');

/**
 * Dashboard (R2.2/E1): die 5 Kernzahlen aus dem Gewerke-Budget —
 * Budget (aktuelle Schätzung), Beauftragt, Abgerechnet, Bezahlt und
 * Prognose-Abweichung — alle brutto, gleiche Formeln wie die Budget-Seite.
 */
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { trades, loading: tradesLoading } = useTrades();
  const { documents } = useDocuments();
  const { getDeductionsForInvoice } = useInvoiceDeductions();
  const { getTotalPaid } = useInvoicePayments();
  const { totalInterest } = useLoans();
  const { formatAmount } = usePrivacy();

  const loading = invoicesLoading || tradesLoading;

  const metrics = useMemo(() => {
    const active = invoices.filter((i) => i.status !== 'cancelled');

    // Block-Zuordnung wie auf der Budget-Seite: Ist-Werte zählen auf
    // FIRMEN-Ebene (User-Feedback 11.07.), Dokument-Firmen-ID als stärkstes Signal
    const contractorByInvoice = new Map<string, string>();
    for (const doc of documents) {
      if (doc.invoice_id && doc.contractor_id && !contractorByInvoice.has(doc.invoice_id)) {
        contractorByInvoice.set(doc.invoice_id, doc.contractor_id);
      }
    }
    const blockKeyByInvoice = new Map<string, string | null>();
    for (const inv of active) {
      blockKeyByInvoice.set(inv.id, resolveInvoiceBlockKey(trades, inv, contractorByInvoice.get(inv.id)));
    }

    const payableOf = (inv: Invoice) =>
      toGross(getPayableAmount(Number(inv.amount), getDeductionsForInvoice(inv.id)), invTaxStatus(inv));

    // Abgerechnet/Bezahlt über ALLE Rechnungen (auch ohne Gewerk-Zuordnung),
    // damit auf dem Dashboard kein Geld "verschwindet".
    let billed = 0;
    let paid = 0;
    for (const inv of active) {
      billed += payableOf(inv);
      paid += toGross(getTotalPaid(inv.id), invTaxStatus(inv));
    }
    // Kredit-Zinsen (SRS 4.4) sind gezahlte Baukosten (steuerfrei, keine Umrechnung)
    billed += totalInterest;
    paid += totalInterest;

    // Ist je Firmen-Block
    const billedByBlock = new Map<string, number>();
    for (const inv of active) {
      const key = blockKeyByInvoice.get(inv.id);
      if (key) billedByBlock.set(key, (billedByBlock.get(key) || 0) + payableOf(inv));
    }
    const finTrade = trades.find((t) => t.section === 800 && normalizeTradeName(t.name).includes('finanzierung'));
    if (finTrade && totalInterest > 0) {
      const key = tradeBlockKey(finTrade);
      billedByBlock.set(key, (billedByBlock.get(key) || 0) + totalInterest);
    }

    // Soll je Firmen-Block; Prognose = Σ max(Schätzung, Beauftragt, Abgerechnet) je Block
    let budget = 0;
    let awarded = 0;
    let awardedCount = 0;
    const sollByBlock = new Map<string, { est: number; awEff: number }>();
    for (const t of trades) {
      const est = t.current_estimate
        ? toGross(Number(t.current_estimate.amount), t.current_estimate.tax_status)
        : 0;
      const aw = t.awarded_amount != null ? toGross(Number(t.awarded_amount), t.awarded_tax_status) : null;
      if (aw != null) awardedCount += 1;
      budget += est;
      awarded += aw ?? est;
      const key = tradeBlockKey(t);
      const soll = sollByBlock.get(key) || { est: 0, awEff: 0 };
      soll.est += est;
      soll.awEff += aw ?? est;
      sollByBlock.set(key, soll);
    }
    let prognose = 0;
    for (const [key, soll] of sollByBlock) {
      prognose += Math.max(soll.est, soll.awEff, billedByBlock.get(key) || 0);
    }

    return {
      billed,
      paid,
      open: Math.max(billed - paid, 0),
      budget,
      awarded,
      awardedCount,
      prognose,
      delta: prognose - budget,
      reviewCount: invoices.filter((i) => i.status === 'review_needed').length,
      unassignedCount: active.filter((i) => blockKeyByInvoice.get(i.id) == null).length,
    };
  }, [invoices, trades, documents, getDeductionsForInvoice, getTotalPaid, totalInterest]);

  const formatCurrency = (amount: number) => formatAmount(amount);
  const tradeName = (inv: Invoice) => trades.find((t) => t.id === inv.trade_id)?.name || null;

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
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Übersicht Ihrer Baukosten — alle Werte brutto</p>
        </div>

        {/* Hinweise: zu prüfende / nicht zugeordnete Rechnungen */}
        {(metrics.reviewCount > 0 || metrics.unassignedCount > 0) && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              {metrics.reviewCount > 0 && (
                <button className="underline-offset-2 hover:underline" onClick={() => navigate('/invoices')}>
                  {metrics.reviewCount} Rechnung(en) zu prüfen
                </button>
              )}
              {metrics.unassignedCount > 0 && (
                <button className="underline-offset-2 hover:underline" onClick={() => navigate('/budget')}>
                  {metrics.unassignedCount} Rechnung(en) ohne Budget-Zuordnung — Gewerk für die Firma anlegen
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kernzahlen (E1) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-[4rem]" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Budget (Schätzung)</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.budget)}</div>
              <p className="text-xs text-muted-foreground mt-1">aktuelle Kostenberechnung</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-[4rem]" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Beauftragt</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Euro className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.awarded)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.awardedCount} von {trades.length} Gewerken beauftragt
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-[4rem]" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Abgerechnet</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.billed)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Σ Zahlbeträge aus {invoices.length} Rechnungen
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-[4rem]" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatCurrency(metrics.paid)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                noch offen: {formatCurrency(metrics.open)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Prognose (aus dem Gewerke-Budget) */}
        {trades.length > 0 && (
          <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={() => navigate('/budget')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Prognose: {formatCurrency(metrics.prognose)}
                {metrics.delta > 0.005 ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-emerald-500" />
                )}
              </CardTitle>
              <CardDescription>
                je Gewerk max(Schätzung, Beauftragt, Abgerechnet) —{' '}
                {metrics.delta > 0.005
                  ? `${formatCurrency(Math.abs(metrics.delta))} über der aktuellen Schätzung`
                  : `${formatCurrency(Math.abs(metrics.delta))} unter der aktuellen Schätzung`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Abgerechnet: {formatCurrency(metrics.billed)}</span>
                  <span>Prognose: {formatCurrency(metrics.prognose)}</span>
                </div>
                <Progress value={metrics.prognose > 0 ? Math.min((metrics.billed / metrics.prognose) * 100, 100) : 0} />
                <p className="text-right text-sm text-muted-foreground">
                  {metrics.prognose > 0 ? ((metrics.billed / metrics.prognose) * 100).toFixed(1) : '0.0'}% der Prognose abgerechnet
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/20" onClick={() => navigate('/invoices')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Rechnungen
              </CardTitle>
              <CardDescription>Rechnungen hochladen und verwalten</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full group-hover:bg-primary/90">
                Zur Rechnungsverwaltung
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/20" onClick={() => navigate('/budget')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-primary" />
                Budget
              </CardTitle>
              <CardDescription>Gewerke, Schätzungen und Soll/Ist</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary">
                Zum Budget
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/20" onClick={() => navigate('/documents')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5 text-primary" />
                Dokumente
              </CardTitle>
              <CardDescription>Belege hochladen und wiederfinden</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                Zu den Dokumenten
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
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
              <div className="space-y-2">
                {invoices.slice(0, 5).map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{invoice.company_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {tradeName(invoice) || 'Kein Gewerk zugeordnet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(Number(invoice.amount))}</p>
                      <p className={`text-sm font-medium ${invoice.is_paid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {invoice.is_paid ? 'Bezahlt' : 'Offen'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
