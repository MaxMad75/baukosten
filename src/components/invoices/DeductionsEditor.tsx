import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeductionType, DEDUCTION_TYPE_LABELS } from '@/lib/types';
import { MinusCircle, Plus, Trash2 } from 'lucide-react';

export interface DeductionRow {
  deduction_type: DeductionType;
  label: string;
  mode: 'percent' | 'absolute';
  percentage: string;
  amount: string;
}

export const emptyDeductionRow: DeductionRow = {
  deduction_type: 'skonto', label: '', mode: 'percent', percentage: '', amount: '',
};

/** Absolute deduction amount of a row, derived from % when in percent mode. */
export function deductionRowAmount(row: DeductionRow, invoiceAmount: number): number {
  if (row.mode === 'percent') {
    const pct = parseFloat(row.percentage);
    if (isNaN(pct)) return 0;
    return Math.round(invoiceAmount * pct) / 100;
  }
  const amount = parseFloat(row.amount);
  return isNaN(amount) ? 0 : Math.round(amount * 100) / 100;
}

interface Props {
  invoiceAmount: number;
  rows: DeductionRow[];
  onChange: (rows: DeductionRow[]) => void;
  formatAmount: (n: number) => string;
}

/**
 * Abzüge aus der Rechnungsprüfung (Skonto, Sicherheitseinbehalt, Baustrom …),
 * je Zeile wahlweise in % des Rechnungsbetrags oder absolut. Darunter wird
 * der resultierende Zahlbetrag angezeigt.
 */
export const DeductionsEditor: React.FC<Props> = ({ invoiceAmount, rows, onChange, formatAmount }) => {
  const totalDeductions = rows.reduce((s, r) => s + deductionRowAmount(r, invoiceAmount), 0);
  const payable = Math.max(Math.round((invoiceAmount - totalDeductions) * 100) / 100, 0);

  const updateRow = (idx: number, patch: Partial<DeductionRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-3 border rounded-lg p-4">
      <div className="flex items-center gap-2">
        <MinusCircle className="h-4 w-4 text-muted-foreground" />
        <Label className="font-semibold">Abzüge (Rechnungsprüfung)</Label>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Keine Abzüge — der Zahlbetrag entspricht dem Rechnungsbetrag.
        </p>
      )}

      {rows.map((row, idx) => (
        <div key={idx} className="grid gap-2 grid-cols-[1fr_90px_110px_auto] items-end">
          <div className="space-y-1">
            <Label className="text-xs">Art</Label>
            <Select value={row.deduction_type} onValueChange={(v) => updateRow(idx, { deduction_type: v as DeductionType })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DEDUCTION_TYPE_LABELS) as DeductionType[]).map((t) => (
                  <SelectItem key={t} value={t}>{DEDUCTION_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.deduction_type === 'sonstiges' && (
              <Input
                className="h-8 mt-1"
                placeholder="Bezeichnung"
                value={row.label}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Modus</Label>
            <Select value={row.mode} onValueChange={(v) => updateRow(idx, { mode: v as 'percent' | 'absolute' })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">%</SelectItem>
                <SelectItem value="absolute">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{row.mode === 'percent' ? 'Prozent' : 'Betrag'}</Label>
            {row.mode === 'percent' ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number" step="0.1" min="0" max="100" className="h-9"
                  placeholder="z.B. 3"
                  value={row.percentage}
                  onChange={(e) => updateRow(idx, { percentage: e.target.value })}
                />
              </div>
            ) : (
              <Input
                type="number" step="0.01" min="0" className="h-9"
                placeholder="0,00"
                value={row.amount}
                onChange={(e) => updateRow(idx, { amount: e.target.value })}
              />
            )}
          </div>
          <div className="flex items-center gap-1 h-9">
            <span className="text-xs text-muted-foreground whitespace-nowrap w-20 text-right">
              −{formatAmount(deductionRowAmount(row, invoiceAmount))}
            </span>
            <Button type="button" size="icon" variant="ghost" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { ...emptyDeductionRow }])}>
          <Plus className="h-4 w-4 mr-1" /> Abzug
        </Button>
        {rows.length > 0 && (
          <div className="text-sm text-right">
            <span className="text-muted-foreground">
              {formatAmount(invoiceAmount)} − {formatAmount(totalDeductions)} ={' '}
            </span>
            <span className="font-semibold">Zahlbetrag {formatAmount(payable)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
