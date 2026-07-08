import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Invoice, InvoicePayment, Profile } from '@/lib/types';
import { Trash2, Undo2, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const RETENTION_DAYS = 30;

const isExpired = (deletedAt: string | null | undefined) =>
  !!deletedAt && Date.now() - new Date(deletedAt).getTime() > RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface Props {
  profiles: Profile[];
  formatAmount: (n: number) => string;
  fetchTrashedInvoices: () => Promise<Invoice[]>;
  fetchTrashedPayments: () => Promise<InvoicePayment[]>;
  restoreInvoice: (id: string) => Promise<boolean>;
  purgeInvoice: (id: string) => Promise<boolean>;
  restorePayment: (id: string) => Promise<boolean>;
  purgePayment: (id: string) => Promise<boolean>;
  /** Changes whenever page data changes, triggering a reload of the trash */
  refreshSignal: string;
  /** Called after restore/purge so the page can refetch */
  onChanged: () => void;
  /** Active invoices, for labelling payments of non-trashed invoices */
  invoices: Invoice[];
}

/**
 * Papierkorb: soft-deleted invoices and payments, restorable for 30 days.
 * Entries older than the retention period are purged automatically on load.
 */
export const TrashCard: React.FC<Props> = ({
  profiles, formatAmount, fetchTrashedInvoices, fetchTrashedPayments,
  restoreInvoice, purgeInvoice, restorePayment, purgePayment, refreshSignal, onChanged, invoices,
}) => {
  const [trashedInvoices, setTrashedInvoices] = useState<Invoice[]>([]);
  const [trashedPayments, setTrashedPayments] = useState<InvoicePayment[]>([]);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [inv, pay] = await Promise.all([fetchTrashedInvoices(), fetchTrashedPayments()]);

    // Auto-purge entries past the retention period
    for (const i of inv.filter((x) => isExpired(x.deleted_at))) await purgeInvoice(i.id);
    for (const p of pay.filter((x) => isExpired(x.deleted_at))) await purgePayment(p.id);

    setTrashedInvoices(inv.filter((x) => !isExpired(x.deleted_at)));
    // Payments of trashed invoices are handled via their invoice entry
    const trashedInvoiceIds = new Set(inv.map((x) => x.id));
    setTrashedPayments(pay.filter((x) => !isExpired(x.deleted_at) && !trashedInvoiceIds.has(x.invoice_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const total = trashedInvoices.length + trashedPayments.length;
  if (total === 0) return null;

  const invoiceLabel = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId) || trashedInvoices.find((i) => i.id === invoiceId);
    return inv ? inv.company_name : 'Unbekannte Rechnung';
  };

  const handle = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    if (ok) {
      await load();
      onChanged();
    }
    setBusy(false);
  };

  const emptyTrash = async () => {
    setBusy(true);
    for (const i of trashedInvoices) await purgeInvoice(i.id);
    for (const p of trashedPayments) await purgePayment(p.id);
    await load();
    onChanged();
    setBusy(false);
    setConfirmEmpty(false);
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
          <Trash2 className="h-4 w-4" /> Papierkorb ({total})
        </CardTitle>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmEmpty(true)} disabled={busy}>
          Papierkorb leeren
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {trashedInvoices.map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">Rechnung</span> {inv.company_name}
              {inv.invoice_number && <span className="text-muted-foreground"> · Nr. {inv.invoice_number}</span>}
              <span className="text-muted-foreground"> · {formatAmount(Number(inv.amount))}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              gelöscht {inv.deleted_at ? format(new Date(inv.deleted_at), 'dd.MM.yy', { locale: de }) : ''}
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => handle(() => restoreInvoice(inv.id))}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Wiederherstellen
            </Button>
            <Button size="icon" variant="ghost" disabled={busy} title="Endgültig löschen"
              onClick={() => handle(() => purgeInvoice(inv.id))}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {trashedPayments.map((p) => {
          const payer = profiles.find((pr) => pr.id === p.profile_id);
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">Zahlung</span> {payer?.name || 'Unbekannt'} · {formatAmount(Number(p.amount))}
                <span className="text-muted-foreground"> · {invoiceLabel(p.invoice_id)}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                gelöscht {p.deleted_at ? format(new Date(p.deleted_at), 'dd.MM.yy', { locale: de }) : ''}
              </span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => handle(() => restorePayment(p.id))}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Wiederherstellen
              </Button>
              <Button size="icon" variant="ghost" disabled={busy} title="Endgültig löschen"
                onClick={() => handle(() => purgePayment(p.id))}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">
          Einträge werden nach {RETENTION_DAYS} Tagen automatisch endgültig gelöscht.
        </p>
      </CardContent>

      <AlertDialog open={confirmEmpty} onOpenChange={(o) => { if (!o) setConfirmEmpty(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Papierkorb leeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle {total} Einträge werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={emptyTrash}>
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
