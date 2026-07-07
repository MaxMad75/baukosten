import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Profile } from '@/lib/types';
import { Scale, Pencil, Check, X, ArrowRight } from 'lucide-react';

export interface PersonBalance {
  profileId: string;
  name: string;
  paid: number;
  sharePercent: number;
  target: number;
  /** paid − target: > 0 hat zu viel gezahlt (bekommt), < 0 schuldet */
  diff: number;
}

/**
 * Balance per person: how much everyone paid vs. their target share of the
 * total. Shares default to an equal split; a stored map (profile_id -> %)
 * overrides it and is normalized so slightly-off sums still work.
 */
export function computeBalances(
  profiles: Pick<Profile, 'id' | 'name'>[],
  paidByProfile: Map<string, number>,
  targetShares?: Record<string, number> | null
): PersonBalance[] {
  if (profiles.length === 0) return [];
  const totalPaid = Array.from(paidByProfile.values()).reduce((s, v) => s + v, 0);

  const rawShares = profiles.map((p) => {
    const stored = targetShares?.[p.id];
    return typeof stored === 'number' && stored >= 0 ? stored : null;
  });
  const anyStored = rawShares.some((s) => s !== null);
  const shares = anyStored ? rawShares.map((s) => s ?? 0) : profiles.map(() => 100 / profiles.length);
  const shareSum = shares.reduce((s, v) => s + v, 0) || 1;

  return profiles.map((p, i) => {
    const sharePercent = (shares[i] / shareSum) * 100;
    const paid = paidByProfile.get(p.id) || 0;
    const target = Math.round(totalPaid * sharePercent) / 100;
    return {
      profileId: p.id,
      name: p.name,
      paid,
      sharePercent,
      target,
      diff: Math.round((paid - target) * 100) / 100,
    };
  });
}

/** Greedy settlement: who transfers how much to whom to even things out. */
export function computeSettlements(balances: PersonBalance[]): Array<{ from: string; to: string; amount: number }> {
  const creditors = balances.filter((b) => b.diff > 0.005).map((b) => ({ ...b, rest: b.diff })).sort((a, b) => b.rest - a.rest);
  const debtors = balances.filter((b) => b.diff < -0.005).map((b) => ({ ...b, rest: -b.diff })).sort((a, b) => b.rest - a.rest);
  const result: Array<{ from: string; to: string; amount: number }> = [];

  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (debtor.rest < 0.005) break;
      if (creditor.rest < 0.005) continue;
      const amount = Math.round(Math.min(debtor.rest, creditor.rest) * 100) / 100;
      result.push({ from: debtor.name, to: creditor.name, amount });
      debtor.rest -= amount;
      creditor.rest -= amount;
    }
  }
  return result;
}

interface Props {
  profiles: Profile[];
  paidByProfile: Map<string, number>;
  targetShares: Record<string, number> | null;
  onSaveShares: (shares: Record<string, number> | null) => Promise<void>;
  formatAmount: (n: number) => string;
}

export const BalanceCard: React.FC<Props> = ({ profiles, paidByProfile, targetShares, onSaveShares, formatAmount }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const balances = computeBalances(profiles, paidByProfile, targetShares);
  const settlements = computeSettlements(balances);
  const totalPaid = Array.from(paidByProfile.values()).reduce((s, v) => s + v, 0);

  if (profiles.length < 2 || totalPaid <= 0) return null;

  const startEditing = () => {
    const initial: Record<string, string> = {};
    balances.forEach((b) => { initial[b.profileId] = String(Math.round(b.sharePercent * 10) / 10); });
    setDraft(initial);
    setEditing(true);
  };

  const draftSum = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const draftValid = Math.abs(draftSum - 100) < 0.5;

  const handleSave = async () => {
    if (!draftValid) return;
    setSaving(true);
    const shares: Record<string, number> = {};
    for (const [id, value] of Object.entries(draft)) shares[id] = parseFloat(value) || 0;
    await onSaveShares(shares);
    setSaving(false);
    setEditing(false);
  };

  const handleReset = async () => {
    setSaving(true);
    await onSaveShares(null);
    setSaving(false);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" /> Ausgleich — Wer schuldet wem?
        </CardTitle>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={startEditing} title="Soll-Quote anpassen">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Quote
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <>
            {balances.map((b) => (
              <div key={b.profileId} className="flex items-center justify-between text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground">
                  {formatAmount(b.paid)} gezahlt · Soll {formatAmount(b.target)} ({b.sharePercent.toFixed(0)}%)
                </span>
                <span className={`w-28 text-right font-medium ${b.diff > 0.005 ? 'text-green-600' : b.diff < -0.005 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {b.diff > 0.005 ? '+' : ''}{formatAmount(b.diff)}
                </span>
              </div>
            ))}
            {settlements.length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm font-medium">
                    {s.from} <ArrowRight className="h-4 w-4 text-muted-foreground" /> {s.to}: {formatAmount(s.amount)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-600">Ausgeglichen — niemand schuldet jemandem etwas. 🎉</p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <Label className="min-w-[100px]">{p.name}</Label>
                <Input
                  type="number" step="0.1" min="0" max="100" className="w-24 h-9"
                  value={draft[p.id] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ))}
            <p className={`text-xs ${draftValid ? 'text-green-600' : 'text-destructive'}`}>
              Summe: {draftSum.toFixed(1)}% {draftValid ? '' : '— muss 100% ergeben'}
            </p>
            <div className="flex justify-between gap-2">
              <Button size="sm" variant="outline" onClick={handleReset} disabled={saving}>
                Gleichmäßig verteilen
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                  <X className="mr-1 h-3.5 w-3.5" /> Abbrechen
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!draftValid || saving}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Speichern
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
