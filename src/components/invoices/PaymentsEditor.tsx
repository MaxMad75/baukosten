import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InvoicePayment, Profile } from '@/lib/types';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export interface NewPaymentDraft {
  payment_date: string;
  profile_id: string;
  amount: string;
}

interface Props {
  payments: InvoicePayment[];
  profiles: Profile[];
  invoiceAmount: number;
  newPayment: NewPaymentDraft;
  onNewPaymentChange: (draft: NewPaymentDraft) => void;
  onAdd: () => void;
  onDelete: (paymentId: string) => void;
  formatAmount: (n: number) => string;
}

/**
 * Payments list + add row used in the invoice edit dialog. Payments are the
 * single source of truth for the Zahlungsverteilung; changes are applied
 * immediately and the invoice status is recalculated by the DB trigger.
 */
export const PaymentsEditor: React.FC<Props> = ({
  payments, profiles, invoiceAmount, newPayment, onNewPaymentChange, onAdd, onDelete, formatAmount,
}) => {
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <Label className="font-semibold">Zahlungen</Label>
        </div>
        <span className={`text-sm ${Math.abs(totalPaid - invoiceAmount) < 0.01 ? 'text-green-600' : 'text-muted-foreground'}`}>
          {formatAmount(totalPaid)} / {formatAmount(invoiceAmount)} bezahlt
        </span>
      </div>

      {payments.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Zahlungen erfasst.</p>
      )}

      {payments.map((p) => {
        const payer = profiles.find((pr) => pr.id === p.profile_id);
        return (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-[100px] font-medium">{payer?.name || 'Unbekannt'}</span>
            <span className="text-muted-foreground">{format(new Date(p.payment_date), 'dd.MM.yyyy', { locale: de })}</span>
            <span className="ml-auto">{formatAmount(Number(p.amount))}</span>
            <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(p.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      <div className="grid gap-2 grid-cols-[1fr_130px_110px_auto] items-end pt-2 border-t">
        <div className="space-y-1">
          <Label className="text-xs">Person</Label>
          <Select value={newPayment.profile_id} onValueChange={(v) => onNewPaymentChange({ ...newPayment, profile_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Wählen…" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Datum</Label>
          <Input type="date" className="h-9" value={newPayment.payment_date} onChange={(e) => onNewPaymentChange({ ...newPayment, payment_date: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Betrag</Label>
          <Input type="number" step="0.01" className="h-9" placeholder="0,00" value={newPayment.amount} onChange={(e) => onNewPaymentChange({ ...newPayment, amount: e.target.value })} />
        </div>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Zahlungen werden sofort gespeichert; der Rechnungsstatus wird automatisch aktualisiert.
      </p>
    </div>
  );
};
