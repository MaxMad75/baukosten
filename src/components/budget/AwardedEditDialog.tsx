import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { Trade, TradeWithEstimates } from '@/lib/types';

export interface AwardedUpdate {
  tradeId: string;
  awarded_amount: number | null;
  awarded_tax_status: Trade['awarded_tax_status'];
  awarded_note: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Firma bzw. Einzel-Gewerk, dessen Auftragssummen bearbeitet werden */
  title: string;
  trades: TradeWithEstimates[];
  onSubmit: (updates: AwardedUpdate[]) => Promise<boolean>;
}

/**
 * Auftragssummen einer FIRMA pflegen (User-Feedback 15.07.): Der Bauherr
 * denkt in Verträgen je Firma — der Dialog zeigt alle Gewerke der Firma mit
 * ihrer Auftragssumme und der Gesamtsumme. Gespeichert wird weiterhin am
 * Gewerk (einzige Quelle, keine doppelte Wahrheit), die Firma ist nur die
 * Klammer. Leeres Feld = noch nicht beauftragt (Schätzwert wird angesetzt).
 */
export const AwardedEditDialog: React.FC<Props> = ({ open, onOpenChange, title, trades, onSubmit }) => {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isGross, setIsGross] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmounts(Object.fromEntries(
      trades.map((t) => [t.id, t.awarded_amount != null ? String(t.awarded_amount) : ''])
    ));
    setNotes(Object.fromEntries(trades.map((t) => [t.id, t.awarded_note || ''])));
    setIsGross(trades[0]?.awarded_tax_status === 'gross');
  }, [open, trades]);

  const total = trades.reduce((s, t) => s + (parseFloat(amounts[t.id] || '') || 0), 0);
  const estimateTotal = trades.reduce((s, t) => s + Number(t.current_estimate?.amount ?? 0), 0);

  const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  const handleSubmit = async () => {
    setSaving(true);
    const ok = await onSubmit(trades.map((t) => {
      const raw = (amounts[t.id] || '').trim();
      const parsed = raw === '' ? null : parseFloat(raw);
      return {
        tradeId: t.id,
        awarded_amount: parsed != null && !isNaN(parsed) ? parsed : null,
        awarded_tax_status: isGross ? 'gross' : 'net',
        awarded_note: (notes[t.id] || '').trim() || null,
      };
    }));
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Auftragssummen · {title}</DialogTitle>
          <DialogDescription>
            Was wurde laut Vertrag beauftragt? Leer lassen, solange kein Auftrag vergeben ist —
            dann rechnet das Budget mit der Kostenberechnung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {trades.map((t) => (
            <div key={t.id} className="grid gap-2 md:grid-cols-[1fr_170px]">
              <div className="space-y-1">
                <Label className="text-sm">{t.name}</Label>
                <Input
                  value={notes[t.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                  placeholder="Vermerk, z. B. Auftrag vom 12.03.2026"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Schätzung {fmt(Number(t.current_estimate?.amount ?? 0))}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amounts[t.id] || ''}
                  onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })}
                  placeholder="kein Auftrag"
                />
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 border-t pt-3">
            <Checkbox id="awarded-gross-all" checked={isGross} onCheckedChange={(c) => setIsGross(!!c)} />
            <Label htmlFor="awarded-gross-all" className="cursor-pointer text-sm">
              Beträge inkl. MwSt (brutto) — sonst netto
            </Label>
          </div>

          {trades.length > 1 && (
            <div className="flex justify-between text-sm font-medium">
              <span>Summe Auftrag</span>
              <span>{fmt(total)} <span className="font-normal text-muted-foreground">({isGross ? 'brutto' : 'netto'})</span></span>
            </div>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Summe Kostenberechnung</span>
            <span>{fmt(estimateTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
