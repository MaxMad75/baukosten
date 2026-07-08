import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Invoice, InvoicePayment, Profile } from '@/lib/types';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export interface PersonPayments {
  profileId: string;
  name: string;
  total: number;
  /** Anteil an allen Zahlungen — dokumentiert das Zahlungsverhältnis */
  sharePercent: number;
  items: Array<{ invoice: Invoice; amount: number }>;
}

/**
 * Group payments by person and, per person, by invoice — "welche Rechnungen
 * wurden von wem zu welchem Teil bezahlt". The share of total payments
 * documents the payment ratio (relevant for ownership shares).
 */
export function buildPaymentsByPerson(
  profiles: Pick<Profile, 'id' | 'name'>[],
  invoices: Invoice[],
  payments: InvoicePayment[]
): PersonPayments[] {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const grandTotal = payments.reduce((s, p) => s + Number(p.amount), 0);

  return profiles
    .map((profile) => {
      const own = payments.filter((p) => p.profile_id === profile.id);
      const byInvoice = new Map<string, number>();
      for (const p of own) {
        byInvoice.set(p.invoice_id, (byInvoice.get(p.invoice_id) || 0) + Number(p.amount));
      }
      const items = Array.from(byInvoice.entries())
        .map(([invoiceId, amount]) => {
          const invoice = invoiceById.get(invoiceId);
          return invoice ? { invoice, amount } : null;
        })
        .filter((x): x is { invoice: Invoice; amount: number } => x !== null)
        .sort((a, b) => new Date(b.invoice.invoice_date).getTime() - new Date(a.invoice.invoice_date).getTime());

      const total = items.reduce((s, i) => s + i.amount, 0);
      return {
        profileId: profile.id,
        name: profile.name,
        total,
        sharePercent: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
        items,
      };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
}

interface Props {
  profiles: Profile[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  formatAmount: (n: number) => string;
}

export const PaymentsByPersonCard: React.FC<Props> = ({ profiles, invoices, payments, formatAmount }) => {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const persons = buildPaymentsByPerson(profiles, invoices, payments);

  if (persons.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpenIds(next);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Zahlungen nach Person
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {persons.map((person) => (
          <Collapsible key={person.profileId} open={openIds.has(person.profileId)} onOpenChange={() => toggle(person.profileId)}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                {openIds.has(person.profileId)
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="font-medium">{person.name}</span>
                <span className="text-xs text-muted-foreground">
                  {person.items.length} Rechnung{person.items.length === 1 ? '' : 'en'}
                </span>
                <span className="ml-auto font-medium">{formatAmount(person.total)}</span>
                <span className="w-14 text-right text-xs text-muted-foreground">{person.sharePercent.toFixed(1)}%</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-8 space-y-1 border-l pl-4 py-1">
                {person.items.map(({ invoice, amount }) => {
                  const invoiceTotal = Number(invoice.amount);
                  const isPartial = amount < invoiceTotal - 0.005;
                  return (
                    <div key={invoice.id} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{format(new Date(invoice.invoice_date), 'dd.MM.yy', { locale: de })}</span>{' '}
                        {invoice.company_name}
                        {invoice.invoice_number && <span className="text-muted-foreground"> · Nr. {invoice.invoice_number}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        {formatAmount(amount)}
                        {isPartial && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            von {formatAmount(invoiceTotal)} ({Math.round((amount / invoiceTotal) * 100)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
};
