import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from '@e965/xlsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { analyzeSheet, parseDateFromLabel, SheetRows } from '@/lib/estimateImport';
import { TaxStatus, TradeWithEstimates } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trades: TradeWithEstimates[];
  onImport: (
    entries: { trade_id: string; amount: number }[],
    meta: { version_label: string; estimate_date: string | null; is_current: boolean; tax_status: TaxStatus }
  ) => Promise<boolean>;
}

/**
 * Excel-Import (SRS 4.1/R1.5): Architekten-Kostenberechnung hochladen →
 * Zeilen werden per Namensabgleich auf die bestehenden Gewerke gemappt
 * (deterministisch, keine KI) → gewählte Wertspalte wird als neue
 * Schätzversion für alle getroffenen Gewerke in einem Schritt übernommen.
 * Erneuter Import mit gleichem Versions-Label überschreibt die Werte.
 */
export const EstimateImportDialog: React.FC<Props> = ({ open, onOpenChange, trades, onImport }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Record<string, SheetRows>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [estimateDate, setEstimateDate] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);
  const [isGross, setIsGross] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setSheets({});
    setSelectedSheet('');
    setSelectedCol(null);
    setVersionLabel('');
    setEstimateDate('');
    setIsCurrent(true);
    setIsGross(false);
  };

  const tradeRefs = useMemo(() => trades.map((t) => ({ id: t.id, name: t.name })), [trades]);

  const analyses = useMemo(() => {
    const result: Record<string, ReturnType<typeof analyzeSheet>> = {};
    for (const [name, rows] of Object.entries(sheets)) {
      result[name] = analyzeSheet(rows, tradeRefs);
    }
    return result;
  }, [sheets, tradeRefs]);

  const analysis = selectedSheet ? analyses[selectedSheet] : null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const parsed: Record<string, SheetRows> = {};
      for (const name of workbook.SheetNames) {
        parsed[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as SheetRows;
      }
      const analyzed = Object.fromEntries(
        Object.entries(parsed).map(([name, rows]) => [name, analyzeSheet(rows, tradeRefs)])
      );
      // Blatt mit den meisten Gewerk-Treffern vorauswählen
      const best = Object.entries(analyzed).sort(([, a], [, b]) => b.matched.length - a.matched.length)[0];
      if (!best || best[1].matched.length === 0) {
        toast({
          title: 'Keine Gewerke gefunden',
          description: 'In der Datei wurde keine Zeile gefunden, die einem Gewerk-Namen entspricht.',
          variant: 'destructive',
        });
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      selectSheet(best[0], analyzed[best[0]]);
    } catch {
      toast({ title: 'Fehler', description: 'Die Datei konnte nicht gelesen werden.', variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const selectSheet = (name: string, sheetAnalysis: ReturnType<typeof analyzeSheet>) => {
    setSelectedSheet(name);
    const firstCol = sheetAnalysis.columns[0] || null;
    selectColumn(firstCol?.colIndex ?? null, firstCol?.label ?? null);
  };

  const selectColumn = (colIndex: number | null, label: string | null) => {
    setSelectedCol(colIndex);
    setVersionLabel(label || `Import vom ${new Date().toLocaleDateString('de-DE')}`);
    setEstimateDate(parseDateFromLabel(label) || '');
  };

  const entries = useMemo(() => {
    if (!analysis || selectedCol == null) return [];
    return analysis.matched
      .filter((m) => m.values.has(selectedCol))
      .map((m) => ({ trade_id: m.tradeId, tradeName: m.tradeName, amount: m.values.get(selectedCol)! }));
  }, [analysis, selectedCol]);

  const currentEstimateOf = (tradeId: string) =>
    trades.find((t) => t.id === tradeId)?.current_estimate?.amount ?? null;

  const handleImport = async () => {
    if (!versionLabel.trim() || entries.length === 0) return;
    setImporting(true);
    const ok = await onImport(
      entries.map(({ trade_id, amount }) => ({ trade_id, amount })),
      {
        version_label: versionLabel.trim(),
        estimate_date: estimateDate || null,
        is_current: isCurrent,
        tax_status: isGross ? 'gross' : 'net',
      }
    );
    setImporting(false);
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kostenberechnung importieren</DialogTitle>
          <DialogDescription>
            Excel des Architekten hochladen — Zeilen werden über den Gewerk-Namen zugeordnet und
            die gewählte Wertspalte als neue Schätzversion übernommen. Fehlende Gewerke vorher
            unter „Neues Gewerk" anlegen und erneut importieren (gleiches Label überschreibt).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              <span className="ml-2">{fileName ? 'Andere Datei wählen' : 'Excel-Datei wählen'}</span>
            </Button>
            {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={handleFile} />
          </div>

          {analysis && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.keys(sheets).length > 1 && (
                  <div className="space-y-2">
                    <Label>Tabellenblatt</Label>
                    <Select value={selectedSheet} onValueChange={(name) => selectSheet(name, analyses[name])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(analyses).map(([name, a]) => (
                          <SelectItem key={name} value={name}>{name} ({a.matched.length} Gewerke)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Wertspalte</Label>
                  <Select
                    value={selectedCol != null ? String(selectedCol) : ''}
                    onValueChange={(v) => {
                      const col = analysis.columns.find((c) => c.colIndex === Number(v));
                      selectColumn(Number(v), col?.label ?? null);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Spalte wählen…" /></SelectTrigger>
                    <SelectContent>
                      {analysis.columns.map((c) => (
                        <SelectItem key={c.colIndex} value={String(c.colIndex)}>
                          {c.label || `Spalte ${c.colIndex + 1}`} · {c.matchCount} Werte · Σ {fmt(c.sum)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Versions-Label *</Label>
                  <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="Kostenberechnung vom …" />
                </div>
                <div className="space-y-2">
                  <Label>Datum der Kostenberechnung</Label>
                  <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
                </div>
                <div className="col-span-2 flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox id="import-current" checked={isCurrent} onCheckedChange={(c) => setIsCurrent(!!c)} />
                    <Label htmlFor="import-current" className="cursor-pointer">Als aktuelle Schätzung setzen</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="import-gross" checked={isGross} onCheckedChange={(c) => setIsGross(!!c)} />
                    <Label htmlFor="import-gross" className="cursor-pointer">Werte inkl. MwSt (brutto)</Label>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-1 text-sm max-h-64 overflow-y-auto">
                <div className="font-medium mb-2">
                  {entries.length} von {trades.length} Gewerken erkannt · Σ {fmt(entries.reduce((s, e) => s + e.amount, 0))}
                </div>
                {entries.map((e) => {
                  const current = currentEstimateOf(e.trade_id);
                  return (
                    <div key={e.trade_id} className="flex justify-between gap-2">
                      <span className="truncate">{e.tradeName}</span>
                      <span className="whitespace-nowrap">
                        {current != null && <span className="text-muted-foreground mr-2">{fmt(Number(current))} →</span>}
                        {fmt(e.amount)}
                      </span>
                    </div>
                  );
                })}
                {analysis.unmatchedTrades.length > 0 && (
                  <div className="pt-2 text-muted-foreground">
                    Ohne Zeile im Excel (unverändert): {analysis.unmatchedTrades.map((t) => t.name).join(', ')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={importing}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={importing || entries.length === 0 || !versionLabel.trim()}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entries.length > 0 ? `${entries.length} Werte importieren` : 'Importieren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
