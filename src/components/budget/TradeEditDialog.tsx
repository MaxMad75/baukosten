import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Contractor, Trade, TradeSection, TradeWithEstimates, TRADE_SECTION_LABELS } from '@/lib/types';

const NONE_VALUE = 'none';
const SECTIONS = Object.keys(TRADE_SECTION_LABELS).map(Number) as TradeSection[];

/** Vom Dialog gelieferte Gewerk-Stammdaten. */
export interface TradeFormValues {
  name: string;
  section: TradeSection;
  contractor_id: string | null;
  skonto_percent: number | null;
  awarded_amount: number | null;
  awarded_tax_status: Trade['awarded_tax_status'];
  awarded_note: string | null;
  notes: string | null;
  /**
   * Aktuelle Kostenberechnung des Gewerks; null = unverändert lassen.
   * Wird nur geliefert, wenn der Nutzer den Wert im Dialog geändert hat
   * (Dirty-Check), damit Excel-Import-Werte nicht still überschrieben werden.
   */
  estimate_amount: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = neues Gewerk anlegen */
  trade: TradeWithEstimates | null;
  contractors: Contractor[];
  onSubmit: (values: TradeFormValues) => Promise<boolean>;
  /** Vorbefüllung beim Anlegen (z. B. „Gewerk für Firma anlegen" aus der Budget-Seite) */
  defaults?: Partial<TradeFormValues> | null;
}

/**
 * Gewerk anlegen/bearbeiten (SRS 4.1/C1/C3): Stammdaten der Excel-Zeile —
 * Name, Abschnitt, Firma, Auftragssumme ("günstigste oder beauftragt"),
 * Skonto und Notizen. Leere Auftragssumme = noch nicht beauftragt (die
 * Budget-Ansicht setzt dann den Schätzwert kursiv an).
 */
export const TradeEditDialog: React.FC<Props> = ({ open, onOpenChange, trade, contractors, onSubmit, defaults }) => {
  const [name, setName] = useState('');
  const [section, setSection] = useState<TradeSection>(300);
  const [contractorId, setContractorId] = useState<string>(NONE_VALUE);
  const [estimateAmount, setEstimateAmount] = useState('');
  const [initialEstimate, setInitialEstimate] = useState('');
  const [awardedAmount, setAwardedAmount] = useState('');
  const [awardedGross, setAwardedGross] = useState(false);
  const [awardedNote, setAwardedNote] = useState('');
  const [skontoPercent, setSkontoPercent] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(trade?.name || defaults?.name || '');
    setSection(trade?.section ?? defaults?.section ?? 300);
    setContractorId(trade?.contractor_id || defaults?.contractor_id || NONE_VALUE);
    const currentEstimate = trade?.current_estimate?.amount != null ? String(trade.current_estimate.amount) : '';
    setEstimateAmount(currentEstimate);
    setInitialEstimate(currentEstimate);
    setAwardedAmount(trade?.awarded_amount != null ? String(trade.awarded_amount) : '');
    setAwardedGross(trade?.awarded_tax_status === 'gross');
    setAwardedNote(trade?.awarded_note || '');
    setSkontoPercent(trade?.skonto_percent != null ? String(trade.skonto_percent) : '');
    setNotes(trade?.notes || '');
  }, [open, trade, defaults]);

  const handleSubmit = async () => {
    const awarded = awardedAmount.trim() === '' ? null : parseFloat(awardedAmount);
    const skonto = skontoPercent.trim() === '' ? null : parseFloat(skontoPercent);
    // Schätzung nur mitgeben, wenn im Dialog geändert (kein stilles Überschreiben)
    const estimateDirty = estimateAmount.trim() !== initialEstimate.trim();
    const estimate = estimateDirty && estimateAmount.trim() !== '' ? parseFloat(estimateAmount) : null;
    setSaving(true);
    const ok = await onSubmit({
      name: name.trim(),
      section,
      contractor_id: contractorId === NONE_VALUE ? null : contractorId,
      skonto_percent: skonto != null && !isNaN(skonto) ? skonto : null,
      awarded_amount: awarded != null && !isNaN(awarded) ? awarded : null,
      awarded_tax_status: awardedGross ? 'gross' : 'net',
      awarded_note: awardedNote.trim() || null,
      notes: notes.trim() || null,
      estimate_amount: estimate != null && !isNaN(estimate) ? estimate : null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{trade ? 'Gewerk bearbeiten' : 'Neues Gewerk'}</DialogTitle>
          <DialogDescription>
            {trade
              ? 'Stammdaten des Gewerks ändern — die Zeile aus dem Architekten-Excel.'
              : 'Ein neues Gewerk (Budgetposten) anlegen, wie eine Zeile im Architekten-Excel.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 col-span-2 md:col-span-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Erdarbeiten" />
          </div>
          <div className="space-y-2 col-span-2 md:col-span-1">
            <Label>Abschnitt</Label>
            <Select value={String(section)} onValueChange={(v) => setSection(Number(v) as TradeSection)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} · {TRADE_SECTION_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Firma</Label>
            <Select value={contractorId} onValueChange={setContractorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <span className="text-muted-foreground">Keine Firma</span>
                </SelectItem>
                {contractors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Rechnungen dieser Firma werden automatisch diesem Gewerk zugeordnet.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Kostenberechnung / Schätzung (EUR)</Label>
            <Input type="number" step="0.01" value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} placeholder="Budget für diesen Posten" />
            <p className="text-xs text-muted-foreground">
              {trade?.current_estimate
                ? `Aktuell: „${trade.current_estimate.version_label}"`
                : 'Ohne Schätzung gilt jede Rechnung als „über Budget".'}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Beauftragt (EUR)</Label>
            <Input type="number" step="0.01" value={awardedAmount} onChange={(e) => setAwardedAmount(e.target.value)} placeholder="leer = noch nicht beauftragt" />
          </div>
          <div className="space-y-2">
            <Label>Skonto (%)</Label>
            <Input type="number" step="0.1" value={skontoPercent} onChange={(e) => setSkontoPercent(e.target.value)} placeholder="z. B. 3" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Checkbox id="awarded-gross" checked={awardedGross} onCheckedChange={(checked) => setAwardedGross(!!checked)} />
            <Label htmlFor="awarded-gross" className="cursor-pointer">Beträge inkl. MwSt (brutto)</Label>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Vermerk zur Beauftragung</Label>
            <Input value={awardedNote} onChange={(e) => setAwardedNote(e.target.value)} placeholder="z. B. in Fenster+Türarbeiten enthalten" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. noch keine Angebote vorliegend" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
