import React, { useState, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { useEstimates } from '@/hooks/useEstimates';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { useHouseholdProfiles } from '@/hooks/useProfiles';
import { useInvoiceSplits } from '@/hooks/useInvoiceSplits';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel } from '@/utils/excelExport';
import { createBackupZip, downloadBlob, restoreBackupZip } from '@/utils/backup';
import { CostComparison } from '@/lib/types';
import { Download, FileSpreadsheet, Loader2, Archive, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const Export: React.FC = () => {
  const { invoices, loading: invLoading, fetchInvoices } = useInvoices();
  const { estimateItems, loading: estLoading, fetchEstimates } = useEstimates();
  const { kostengruppen, loading: kgLoading, getKostengruppeByCode } = useKostengruppen();
  const { data: profiles, isLoading: profLoading } = useHouseholdProfiles();
  const { allSplits } = useInvoiceSplits();
  const { household, profile } = useAuth();
  const { toast } = useToast();

  const [backupProgress, setBackupProgress] = useState<string | null>(null);
  const [backupPercent, setBackupPercent] = useState(0);
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);
  const [restorePercent, setRestorePercent] = useState(0);
  const [confirmRestore, setConfirmRestore] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loading = invLoading || estLoading || kgLoading || profLoading;

  const handleExcelExport = () => {
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

  const handleBackupExport = async () => {
    if (!household) return;
    setBackupProgress('Starte Backup…');
    setBackupPercent(0);

    try {
      const blob = await createBackupZip({
        householdId: household.id,
        householdName: household.name,
        householdCreatedAt: household.created_at,
        onProgress: (msg, current, total) => {
          setBackupProgress(msg);
          setBackupPercent(Math.round((current / total) * 100));
        },
      });
      downloadBlob(blob, household.name);
      toast({ title: 'Backup erstellt', description: 'Das vollständige Backup wurde heruntergeladen.' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err?.message || 'Backup konnte nicht erstellt werden.', variant: 'destructive' });
    } finally {
      setBackupProgress(null);
      setBackupPercent(0);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      toast({ title: 'Fehler', description: 'Bitte wählen Sie eine .zip-Datei.', variant: 'destructive' });
      return;
    }
    setConfirmRestore(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleRestoreConfirmed = async () => {
    if (!confirmRestore || !household || !profile) return;
    const file = confirmRestore;
    setConfirmRestore(null);
    setRestoreProgress('Starte Wiederherstellung…');
    setRestorePercent(0);
    setRestoreResult(null);

    try {
      const result = await restoreBackupZip(file, household.id, profile.id, (msg, current, total) => {
        setRestoreProgress(msg);
        setRestorePercent(Math.round((current / total) * 100));
      });
      setRestoreResult(result);

      if (result.success) {
        toast({ title: 'Wiederherstellung erfolgreich', description: result.message });
        // Refresh data
        fetchInvoices();
        fetchEstimates();
      } else {
        toast({ title: 'Fehler', description: result.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Fehler', description: err?.message || 'Wiederherstellung fehlgeschlagen.', variant: 'destructive' });
    } finally {
      setRestoreProgress(null);
      setRestorePercent(0);
    }
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Export & Backup</h1>
          <p className="text-muted-foreground">Daten exportieren oder vollständige Backups erstellen und wiederherstellen</p>
        </div>

        {/* Excel Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Excel-Export</CardTitle>
            <CardDescription>Übersicht, Rechnungen, Soll/Ist-Vergleich, Auswertung nach Kostengruppe und Zahler</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm">
              <p><strong>Rechnungen:</strong> {invoices.length}</p>
              <p><strong>Kostenpositionen:</strong> {estimateItems.length}</p>
              <p><strong>Haushaltsmitglieder:</strong> {profiles?.length || 0}</p>
            </div>
            <Button onClick={handleExcelExport} size="lg"><Download className="mr-2 h-4 w-4" />Excel herunterladen</Button>
          </CardContent>
        </Card>

        {/* Full Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5" />Vollständiges Backup</CardTitle>
            <CardDescription>
              Portables ZIP-Archiv mit allen Daten und Anhängen. Enthält backup.json (versioniertes Schema),
              alle Dateien im Ordner attachments/ und ein manifest.yaml. Geeignet für vollständige Wiederherstellung.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm">
              <p><strong>Format:</strong> ZIP (backup.json + attachments/ + manifest.yaml)</p>
              <p><strong>Schema-Version:</strong> 1.0.0</p>
              <p><strong>Enthält:</strong> Profile, Rechnungen, Aufteilungen, Schätzungen, Firmen, Bautagebuch, Dokumente + alle Dateien</p>
            </div>

            {backupProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{backupProgress}</p>
                <Progress value={backupPercent} />
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button onClick={handleBackupExport} size="lg" disabled={!!backupProgress}>
                {backupProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Backup erstellen
              </Button>
              <Button onClick={handleRestoreClick} size="lg" variant="outline" disabled={!!restoreProgress}>
                <Upload className="mr-2 h-4 w-4" />Backup wiederherstellen
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>

            {restoreProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{restoreProgress}</p>
                <Progress value={restorePercent} />
              </div>
            )}

            {restoreResult && (
              <div className={`rounded-lg border p-4 ${restoreResult.success ? 'border-green-200 bg-green-50' : 'border-destructive/30 bg-destructive/10'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {restoreResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
                  <span className="font-medium">{restoreResult.message}</span>
                </div>
                {restoreResult.counts && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                    <span>Firmen: {restoreResult.counts.contractors}</span>
                    <span>Rechnungen: {restoreResult.counts.invoices}</span>
                    <span>Aufteilungen: {restoreResult.counts.invoiceSplits}</span>
                    <span>Schätzungen: {restoreResult.counts.estimates}</span>
                    <span>Positionen: {restoreResult.counts.estimateItems}</span>
                    <span>Tagebuch: {restoreResult.counts.journalEntries}</span>
                    <span>Dokumente: {restoreResult.counts.documents}</span>
                    <span>Anhänge: {restoreResult.counts.attachments}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Daten aus dem Backup <strong>{confirmRestore?.name}</strong> werden in Ihren aktuellen Haushalt importiert.
              Bestehende Daten bleiben erhalten — es werden nur neue Einträge hinzugefügt.
              Profile werden anhand des Namens zugeordnet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreConfirmed}>Wiederherstellen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Export;
