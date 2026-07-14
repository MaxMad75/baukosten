import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Landmark, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useLoans } from '@/hooks/useLoans';
import { useTrades, isFinancingTrade } from '@/hooks/useTrades';
import { LoanWithDetails } from '@/lib/types';

const emptyLoanForm = {
  name: '', bank: '', principal: '', interest_rate_percent: '', start_date: '', notes: '',
};

/**
 * Kredit-Modul (SRS 4.4) unter Einstellungen: Darlehen mit Kreditnehmer-
 * Anteilen und Raten (Zins/Tilgung-Split aus dem Tilgungsplan). Zinsen
 * erscheinen als Kosten im Abschnitt-800-Gewerk "Finanzierung" (wird beim
 * ersten Darlehen automatisch angelegt); Tilgung verschiebt in der
 * Besitzverhältnis-Ansicht den "Kredit"-Anteil auf die Kreditnehmer.
 */
export const LoansCard: React.FC = () => {
  const { householdProfiles } = useAuth();
  const { formatAmount } = usePrivacy();
  const { loans, loading, available, createLoan, updateLoan, deleteLoan, saveShares, addPayment, deletePayment } = useLoans();
  const { trades, createTrade } = useTrades();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanWithDetails | null>(null);
  const [form, setForm] = useState(emptyLoanForm);
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LoanWithDetails | null>(null);
  const [openLoans, setOpenLoans] = useState<Set<string>>(new Set());
  // Raten-Erfassung je Darlehen: Rate gesamt + Zinsanteil, Tilgung = Rest
  const [paymentForms, setPaymentForms] = useState<Record<string, { date: string; total: string; interest: string }>>({});

  // Kreditnehmer = alle außer dem virtuellen Mitglied "Kredit"
  const borrowerProfiles = useMemo(
    () => (householdProfiles || []).filter((p) => p.name.trim().toLowerCase() !== 'kredit'),
    [householdProfiles]
  );

  if (!available) return null;

  const openCreate = () => {
    setEditingLoan(null);
    setForm(emptyLoanForm);
    // Standard: gleiche Anteile für alle Kreditnehmer
    const equal = borrowerProfiles.length > 0 ? (100 / borrowerProfiles.length).toFixed(1) : '';
    setShareInputs(Object.fromEntries(borrowerProfiles.map((p) => [p.id, equal])));
    setDialogOpen(true);
  };

  const openEdit = (loan: LoanWithDetails) => {
    setEditingLoan(loan);
    setForm({
      name: loan.name,
      bank: loan.bank || '',
      principal: loan.principal != null ? String(loan.principal) : '',
      interest_rate_percent: loan.interest_rate_percent != null ? String(loan.interest_rate_percent) : '',
      start_date: loan.start_date || '',
      notes: loan.notes || '',
    });
    setShareInputs(Object.fromEntries(
      borrowerProfiles.map((p) => {
        const share = loan.shares.find((s) => s.profile_id === p.id);
        return [p.id, share ? String(share.share_percent) : ''];
      })
    ));
    setDialogOpen(true);
  };

  const shareSum = Object.values(shareInputs).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const sharesValid = Math.abs(shareSum - 100) < 0.05;

  const handleSave = async () => {
    if (!form.name.trim() || !sharesValid) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      bank: form.bank.trim() || null,
      principal: form.principal.trim() === '' ? null : parseFloat(form.principal),
      interest_rate_percent: form.interest_rate_percent.trim() === '' ? null : parseFloat(form.interest_rate_percent),
      start_date: form.start_date || null,
      notes: form.notes.trim() || null,
    };

    let loanId = editingLoan?.id || null;
    if (editingLoan) {
      const ok = await updateLoan(editingLoan.id, payload);
      if (!ok) loanId = null;
    } else {
      const created = await createLoan(payload);
      loanId = created?.id || null;
    }

    if (loanId) {
      await saveShares(
        loanId,
        borrowerProfiles
          .map((p) => ({ profile_id: p.id, share_percent: parseFloat(shareInputs[p.id]) || 0 }))
          .filter((s) => s.share_percent > 0)
      );
      // Zinsen brauchen ein Zuhause: Abschnitt-800-Gewerk "Finanzierung"
      const hasFinanzierung = trades.some(isFinancingTrade);
      if (!hasFinanzierung) {
        await createTrade({ name: 'Finanzierung', section: 800, notes: 'Kredit-Zinsen (automatisch aus dem Kredit-Modul)' });
      }
      setDialogOpen(false);
    }
    setSaving(false);
  };

  const toggleLoan = (id: string) => {
    setOpenLoans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const paymentFormFor = (loanId: string) =>
    paymentForms[loanId] || { date: format(new Date(), 'yyyy-MM-dd'), total: '', interest: '' };

  const setPaymentForm = (loanId: string, patch: Partial<{ date: string; total: string; interest: string }>) =>
    setPaymentForms((prev) => ({ ...prev, [loanId]: { ...paymentFormFor(loanId), ...patch } }));

  const handleAddPayment = async (loan: LoanWithDetails) => {
    const f = paymentFormFor(loan.id);
    const total = parseFloat(f.total);
    const interest = parseFloat(f.interest) || 0;
    if (!f.date || isNaN(total) || total <= 0 || interest < 0 || interest > total) return;
    const ok = await addPayment(loan.id, {
      payment_date: f.date,
      total_amount: total,
      interest_amount: interest,
      principal_amount: Math.round((total - interest) * 100) / 100,
    });
    if (ok) setPaymentForms((prev) => ({ ...prev, [loan.id]: { date: f.date, total: '', interest: '' } }));
  };

  const profileName = (id: string) => (householdProfiles || []).find((p) => p.id === id)?.name || '?';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Kredit
            </CardTitle>
            <CardDescription>
              Darlehen, Kreditnehmer-Anteile und Raten. Zinsen zählen als Baukosten (Gewerk
              „Finanzierung"), Tilgung verschiebt Vermögen vom „Kredit" auf die Kreditnehmer.
            </CardDescription>
            {loans.length > 0 && !(householdProfiles || []).some((p) => p.name.trim().toLowerCase() === 'kredit') && (
              <p className="text-xs text-amber-700">
                Hinweis: Für die Ansicht „Nach Tilgung" (Zahlungen nach Person) braucht der Haushalt
                ein virtuelles Mitglied mit dem Namen „Kredit" — unten über „Mitglied hinzufügen" anlegen.
              </p>
            )}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">Darlehen anlegen</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : loans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Darlehen angelegt.</p>
        ) : (
          loans.map((loan) => {
            const interestSum = loan.payments.reduce((s, p) => s + Number(p.interest_amount), 0);
            const principalSum = loan.payments.reduce((s, p) => s + Number(p.principal_amount), 0);
            const remaining = loan.principal != null ? Number(loan.principal) - principalSum : null;
            const f = paymentFormFor(loan.id);
            const total = parseFloat(f.total);
            const interest = parseFloat(f.interest) || 0;
            const principalPreview = !isNaN(total) && total > 0 && interest >= 0 && interest <= total
              ? total - interest : null;
            return (
              <Collapsible key={loan.id} open={openLoans.has(loan.id)} onOpenChange={() => toggleLoan(loan.id)}>
                <div className="rounded-lg border">
                  <div className="flex items-center gap-2 p-3">
                    <CollapsibleTrigger asChild>
                      <button className="flex flex-1 items-center gap-2 text-left">
                        {openLoans.has(loan.id)
                          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {loan.name}{loan.bank ? ` · ${loan.bank}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {loan.principal != null && <>Darlehen {formatAmount(Number(loan.principal))} · </>}
                            Zinsen {formatAmount(interestSum)} · Tilgung {formatAmount(principalSum)}
                            {remaining != null && <> · Restschuld {formatAmount(Math.max(remaining, 0))}</>}
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(loan)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(loan)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Anteile: {loan.shares.length === 0
                          ? 'keine festgelegt'
                          : loan.shares.map((s) => `${profileName(s.profile_id)} ${Number(s.share_percent).toLocaleString('de-DE')} %`).join(' · ')}
                      </div>

                      {loan.payments.length > 0 && (
                        <div className="space-y-1">
                          {loan.payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground">{format(new Date(p.payment_date), 'dd.MM.yyyy', { locale: de })}</span>
                              <span className="ml-auto">{formatAmount(Number(p.total_amount))}</span>
                              <span className="text-xs text-muted-foreground w-44 text-right">
                                Zins {formatAmount(Number(p.interest_amount))} · Tilgung {formatAmount(Number(p.principal_amount))}
                              </span>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deletePayment(p.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Datum</Label>
                          <Input type="date" className="h-9 w-36" value={f.date} onChange={(e) => setPaymentForm(loan.id, { date: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Rate gesamt (EUR)</Label>
                          <Input type="number" step="0.01" className="h-9 w-32" value={f.total} onChange={(e) => setPaymentForm(loan.id, { total: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">davon Zins (EUR)</Label>
                          <Input type="number" step="0.01" className="h-9 w-32" value={f.interest} onChange={(e) => setPaymentForm(loan.id, { interest: e.target.value })} />
                        </div>
                        <div className="pb-2 text-xs text-muted-foreground">
                          {principalPreview != null ? `Tilgung: ${formatAmount(principalPreview)}` : 'Tilgung = Rate − Zins'}
                        </div>
                        <Button size="sm" onClick={() => handleAddPayment(loan)} disabled={principalPreview == null}>
                          Rate erfassen
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLoan ? 'Darlehen bearbeiten' : 'Darlehen anlegen'}</DialogTitle>
            <DialogDescription>
              Die Anteile bestimmen, wem die Tilgung als Vermögen zugerechnet wird (Summe 100 %).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Annuitätendarlehen" />
            </div>
            <div className="space-y-2">
              <Label>Bank</Label>
              <Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Darlehenssumme (EUR)</Label>
              <Input type="number" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Sollzins (% p. a.)</Label>
              <Input type="number" step="0.01" value={form.interest_rate_percent} onChange={(e) => setForm({ ...form, interest_rate_percent: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Beginn</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Kreditnehmer-Anteile (%)</Label>
              {borrowerProfiles.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-40 text-sm truncate">{p.name}</span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-9 w-28"
                    value={shareInputs[p.id] || ''}
                    onChange={(e) => setShareInputs({ ...shareInputs, [p.id]: e.target.value })}
                  />
                </div>
              ))}
              <p className={`text-xs ${sharesValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                Summe: {shareSum.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % {sharesValid ? '' : '— muss 100 % ergeben'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !sharesValid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Darlehen löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.name}" wird mit allen Anteilen und {deleteTarget?.payments.length || 0} Rate(n)
              endgültig gelöscht. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deleteTarget) await deleteLoan(deleteTarget.id); setDeleteTarget(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
