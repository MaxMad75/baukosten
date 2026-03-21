import React from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { useInvoiceSplits } from '@/hooks/useInvoiceSplits';
import { exportToExcel } from '@/utils/excelExport';
import { CostComparison } from '@/lib/types';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const Export: React.FC = () => {
  const { invoices, loading: invLoading } = useInvoices();
  const { estimateItems, loading: estLoading } = useEstimates();
  const { kostengruppen, loading: kgLoading, getKostengruppeByCode } = useKostengruppen();
  const { data: profiles, isLoading: profLoading } = useHouseholdProfiles();
  const { allSplits } = useInvoiceSplits();
  const { toast } = useToast();

  const loading = invLoading || estLoading || kgLoading || profLoading;

  const handleExport = () => {
    const allCodes = new Set<string>();
    estimateItems.forEach(i => allCodes.add(i.kostengruppe_code));
    invoices.forEach(i => i.kostengruppe_code && allCodes.add(i.kostengruppe_code));

    const comparisons: CostComparison[] = Array.from(allCodes).map(code => {
      const kg = getKostengruppeByCode(code);
      const estimated = estimateItems.filter(i => i.kostengruppe_code === code).reduce((s, i) => s + Number(i.estimated_amount), 0);
      const actual = invoices.filter(i => i.kostengruppe_code === code).reduce((s, i) => s + Number(i.amount), 0);
      return { kostengruppe_code: code, kostengruppe_name: kg?.name || code, estimated, actual, difference: actual - estimated, percentage: estimated > 0 ? ((actual - estimated) / estimated) * 100 : 0 };
    });

    exportToExcel({ invoices, estimateItems, kostengruppen, profiles: profiles || [], comparisons, splits: allSplits }, 'hausbau-kosten');
    toast({ title: 'Export erfolgreich', description: 'Die Excel-Datei wurde heruntergeladen.' });
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold">Excel-Export</h1><p className="text-muted-foreground">Exportieren Sie alle Daten als Excel-Datei</p></div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Vollständiger Export</CardTitle><CardDescription>Enthält Übersicht, alle Rechnungen, Soll/Ist-Vergleich, Auswertung nach Kostengruppe und nach Zahler</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm"><p><strong>Rechnungen:</strong> {invoices.length}</p><p><strong>Kostenpositionen:</strong> {estimateItems.length}</p><p><strong>Haushaltsmitglieder:</strong> {profiles?.length || 0}</p></div>
            <Button onClick={handleExport} size="lg"><Download className="mr-2 h-4 w-4" />Excel herunterladen</Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Export;
