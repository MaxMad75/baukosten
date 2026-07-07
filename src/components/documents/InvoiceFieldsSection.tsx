import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { Invoice } from '@/lib/types';
import { Loader2, Receipt, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/** Editable invoice fields shown when a document is typed as "Rechnung". */
export interface InvoiceForm {
  company_name: string;
  invoice_number: string;
  amount: string;
  invoice_date: string;
  kostengruppe_code: string;
}

export const emptyInvoiceForm: InvoiceForm = {
  company_name: '', invoice_number: '', amount: '', invoice_date: '', kostengruppe_code: '',
};

interface Props {
  form: InvoiceForm;
  onChange: (form: InvoiceForm) => void;
  duplicate: Invoice | null;
  showAiButton: boolean;
  aiLoading: boolean;
  onAiPass: () => void;
}

/**
 * Invoice fields inside the document upload/edit dialog. Prefilled by the
 * AI analysis, always user-editable; saving creates the invoice record.
 */
export const InvoiceFieldsSection: React.FC<Props> = ({ form, onChange, duplicate, showAiButton, aiLoading, onAiPass }) => (
  <div className="col-span-2 space-y-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
        <Receipt className="h-4 w-4" />
        Rechnungsdaten – bitte prüfen und ggf. korrigieren
      </div>
      {showAiButton && (
        <Button type="button" size="sm" variant="outline" onClick={onAiPass} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
          Per KI ergänzen
        </Button>
      )}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">Firma *</Label>
        <Input value={form.company_name} onChange={(e) => onChange({ ...form, company_name: e.target.value })} placeholder="Firmenname" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Rechnungsnummer</Label>
        <Input value={form.invoice_number} onChange={(e) => onChange({ ...form, invoice_number: e.target.value })} placeholder="optional" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Betrag brutto (EUR) *</Label>
        <Input type="number" step="0.01" value={form.amount} onChange={(e) => onChange({ ...form, amount: e.target.value })} placeholder="0,00" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Rechnungsdatum *</Label>
        <Input type="date" value={form.invoice_date} onChange={(e) => onChange({ ...form, invoice_date: e.target.value })} />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Kostengruppe (DIN 276)</Label>
        <KostengruppenSelect value={form.kostengruppe_code} onValueChange={(v) => onChange({ ...form, kostengruppe_code: v })} />
      </div>
    </div>
    {duplicate && (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
        ⚠ Mögliches Duplikat: Es existiert bereits eine Rechnung von „{duplicate.company_name}"
        {duplicate.invoice_number ? ` (Nr. ${duplicate.invoice_number})` : ''} über{' '}
        {Number(duplicate.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} vom{' '}
        {format(new Date(duplicate.invoice_date), 'dd.MM.yyyy', { locale: de })}.
      </div>
    )}
    <p className="text-xs text-orange-700">
      Beim Speichern wird die Rechnung in der Rechnungsverwaltung angelegt. Dort können Sie sie als bezahlt markieren und die Zahlung aufteilen.
    </p>
  </div>
);
