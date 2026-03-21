import React, { useEffect } from 'react';
import { Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Users, AlertCircle, CheckCircle2 } from 'lucide-react';

export type SplitMode = 'equal' | 'manual' | 'percentage';

export interface SplitEntry {
  profile_id: string;
  amount: number;
  percentage: number | null;
  split_type: SplitMode;
}

interface Props {
  invoiceAmount: number;
  profiles: Profile[];
  splits: SplitEntry[];
  onChange: (splits: SplitEntry[]) => void;
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
}

export const InvoiceSplitEditor: React.FC<Props> = ({
  invoiceAmount,
  profiles,
  splits,
  onChange,
  mode,
  onModeChange,
}) => {
  const totalAssigned = splits.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.round((invoiceAmount - totalAssigned) * 100) / 100;
  const isValid = Math.abs(remaining) < 0.01;

  const availableProfiles = profiles.filter(
    (p) => !splits.some((s) => s.profile_id === p.id)
  );

  // Recalculate on mode change
  useEffect(() => {
    if (mode === 'equal' && splits.length > 0) {
      const perPerson = Math.round((invoiceAmount / splits.length) * 100) / 100;
      const updated = splits.map((s, i) => ({
        ...s,
        amount: i === splits.length - 1 ? Math.round((invoiceAmount - perPerson * (splits.length - 1)) * 100) / 100 : perPerson,
        percentage: Math.round((100 / splits.length) * 100) / 100,
        split_type: 'equal' as SplitMode,
      }));
      onChange(updated);
    }
  }, [mode, splits.length, invoiceAmount]);

  const addPerson = (profileId: string) => {
    const newSplits = [...splits, { profile_id: profileId, amount: 0, percentage: null, split_type: mode }];
    if (mode === 'equal') {
      const perPerson = Math.round((invoiceAmount / newSplits.length) * 100) / 100;
      onChange(
        newSplits.map((s, i) => ({
          ...s,
          amount: i === newSplits.length - 1 ? Math.round((invoiceAmount - perPerson * (newSplits.length - 1)) * 100) / 100 : perPerson,
          percentage: Math.round((100 / newSplits.length) * 100) / 100,
          split_type: 'equal' as SplitMode,
        }))
      );
    } else {
      onChange(newSplits);
    }
  };

  const removePerson = (profileId: string) => {
    const newSplits = splits.filter((s) => s.profile_id !== profileId);
    if (mode === 'equal' && newSplits.length > 0) {
      const perPerson = Math.round((invoiceAmount / newSplits.length) * 100) / 100;
      onChange(
        newSplits.map((s, i) => ({
          ...s,
          amount: i === newSplits.length - 1 ? Math.round((invoiceAmount - perPerson * (newSplits.length - 1)) * 100) / 100 : perPerson,
          percentage: Math.round((100 / newSplits.length) * 100) / 100,
          split_type: 'equal' as SplitMode,
        }))
      );
    } else {
      onChange(newSplits);
    }
  };

  const updateAmount = (profileId: string, value: number) => {
    onChange(
      splits.map((s) =>
        s.profile_id === profileId
          ? { ...s, amount: value, percentage: invoiceAmount > 0 ? Math.round((value / invoiceAmount) * 10000) / 100 : 0, split_type: 'manual' as SplitMode }
          : s
      )
    );
  };

  const updatePercentage = (profileId: string, pct: number) => {
    const amount = Math.round((invoiceAmount * pct) / 10000) / 100;
    onChange(
      splits.map((s) =>
        s.profile_id === profileId
          ? { ...s, amount: Math.round(amount * 100) / 100, percentage: pct, split_type: 'percentage' as SplitMode }
          : s
      )
    );
  };

  const getProfileName = (id: string) => profiles.find((p) => p.id === id)?.name || 'Unbekannt';

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label className="font-semibold">Kostenaufteilung</Label>
        </div>
        <div className="flex gap-1">
          {(['equal', 'manual', 'percentage'] as SplitMode[]).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? 'default' : 'outline'}
              onClick={() => onModeChange(m)}
              className="text-xs"
            >
              {m === 'equal' ? 'Gleichmäßig' : m === 'manual' ? 'Manuell' : 'Prozentual'}
            </Button>
          ))}
        </div>
      </div>

      {splits.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Personen hinzugefügt.</p>
      )}

      {splits.map((entry) => (
        <div key={entry.profile_id} className="flex items-center gap-2">
          <span className="text-sm font-medium min-w-[100px]">{getProfileName(entry.profile_id)}</span>
          {mode === 'equal' ? (
            <div className="flex-1 text-sm text-muted-foreground">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entry.amount)}
              {entry.percentage != null && ` (${entry.percentage.toFixed(1)}%)`}
            </div>
          ) : mode === 'percentage' ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={entry.percentage ?? ''}
                onChange={(e) => updatePercentage(entry.profile_id, parseFloat(e.target.value) || 0)}
                className="w-24"
                placeholder="%"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-sm ml-auto">
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entry.amount)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={entry.amount || ''}
                onChange={(e) => updateAmount(entry.profile_id, parseFloat(e.target.value) || 0)}
                className="w-32"
                placeholder="Betrag"
              />
              <span className="text-sm text-muted-foreground">€</span>
            </div>
          )}
          <Button type="button" size="icon" variant="ghost" onClick={() => removePerson(entry.profile_id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      {availableProfiles.length > 0 && (
        <Select onValueChange={addPerson}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Person hinzufügen…" />
          </SelectTrigger>
          <SelectContent>
            {availableProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Summary bar */}
      {splits.length > 0 && (
        <div className={`flex items-center justify-between text-sm rounded-md px-3 py-2 ${isValid ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-destructive/10 border border-destructive/30 text-destructive'}`}>
          <div className="flex items-center gap-2">
            {isValid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>
              Verteilt: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalAssigned)}
              {' / '}
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(invoiceAmount)}
            </span>
          </div>
          {!isValid && (
            <Badge variant="destructive">
              Rest: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remaining)}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
