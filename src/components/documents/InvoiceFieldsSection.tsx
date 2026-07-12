import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Contractor, Invoice } from '@/lib/types';
import { Check, ChevronsUpDown, Loader2, Plus, Receipt, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

/** Editable invoice fields shown when a document is typed as "Rechnung". */
export interface InvoiceForm {
  company_name: string;
  invoice_number: string;
  amount: string;
  invoice_date: string;
  /** DIN-Code aus der KI-Extraktion; wird nur noch gespeichert, nicht mehr angezeigt (SRS R1.6) */
  kostengruppe_code: string;
  /** Primäre Gewerk-Zuordnung; vorgeschlagen über die Firma→Gewerk-Regel (SRS 4.1) */
  trade_id: string;
}

export const emptyInvoiceForm: InvoiceForm = {
  company_name: '', invoice_number: '', amount: '', invoice_date: '', kostengruppe_code: '', trade_id: '',
};

interface Props {
  form: InvoiceForm;
  onChange: (form: InvoiceForm) => void;
  duplicate: Invoice | null;
  showAiButton: boolean;
  aiLoading: boolean;
  onAiPass: () => void;
  contractors: Contractor[];
}

/**
 * Combobox für Firma: Auswahl aus der bestehenden Firmenliste, mit freier
 * Eingabe für neue Firmen. Ersetzt das reine Textfeld — beim Rechnungs-
 * Upload soll der Nutzer explizit einer Firma zuordnen (nicht optional).
 */
const CompanyCombobox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  contractors: Contractor[];
}> = ({ value, onChange, contractors }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const trimmed = search.trim();
  const hasExact = useMemo(
    () => contractors.some((c) => c.company_name.trim().toLowerCase() === trimmed.toLowerCase()),
    [contractors, trimmed],
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value || 'Firma wählen oder eingeben…'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Firma suchen oder neu eingeben…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-2 text-sm hover:bg-accent"
                  onClick={() => { onChange(trimmed); setOpen(false); }}
                >
                  <Plus className="h-4 w-4" />
                  Neue Firma anlegen: „{trimmed}"
                </button>
              ) : (
                <div className="py-4 text-center text-sm text-muted-foreground">Keine Firmen vorhanden</div>
              )}
            </CommandEmpty>
            <CommandGroup>
              {contractors.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.company_name}
                  onSelect={() => { onChange(c.company_name); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === c.company_name ? 'opacity-100' : 'opacity-0')} />
                  {c.company_name}
                </CommandItem>
              ))}
              {trimmed && !hasExact && (
                <CommandItem
                  value={`__new__${trimmed}`}
                  onSelect={() => { onChange(trimmed); setOpen(false); }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Neue Firma anlegen: „{trimmed}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Invoice fields inside the document upload/edit dialog. Prefilled by the
 * AI analysis, always user-editable; saving creates the invoice record.
 */
export const InvoiceFieldsSection: React.FC<Props> = ({ form, onChange, duplicate, showAiButton, aiLoading, onAiPass, contractors }) => (
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
        <CompanyCombobox
          value={form.company_name}
          onChange={(v) => onChange({ ...form, company_name: v })}
          contractors={contractors}
        />
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
      <p className="col-span-2 text-xs text-muted-foreground">
        Die Budget-Zuordnung läuft automatisch über die Firma — kein Gewerk nötig.
        Verfeinern (Gewerk je Rechnung) geht jederzeit in der Rechnungsverwaltung.
      </p>
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
