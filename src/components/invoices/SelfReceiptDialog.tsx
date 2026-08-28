import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TradeSelect } from '@/components/TradeSelect';
import { supabase } from '@/integrations/supabase/client';
import { useInvoices } from '@/hooks/useInvoices';
import { useDocuments } from '@/hooks/useDocuments';
import { useContractors } from '@/hooks/useContractors';
import { useToast } from '@/hooks/use-toast';
import { FileText } from 'lucide-react';

interface SelfReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyForm = {
  invoice_number: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  company_name: '',
  amount: '',
  description: '',
  trade_id: '',
  is_gross: true,
};

/**
 * Eigenbeleg anlegen (Story A6).
 *
 * Ein Eigenbeleg ist eine Kostenposition ohne Fremdrechnung: Barzahlung,
 * Eigenleistung, oder ein Sammelbeleg, der mehrere Kleinbelege zu einer
 * Position zusammenfasst. Das Bündeln braucht kein eigenes Schema —
 * documents.invoice_id ist N:1, mehrere Belege dürfen also auf denselben
 * Eigenbeleg zeigen; hier wird das nur bedienbar gemacht.
 */
export const SelfReceiptDialog: React.FC<SelfReceiptDialogProps> = ({ open, onOpenChange }) => {
  const { createInvoice, nextSelfReceiptNumber } = useInvoices();
  const { documents, fetchDocuments } = useDocuments();
  const { findOrCreateByName } = useContractors();
  const { toast } = useToast();

  const [form, setForm] = useState(emptyForm);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Nur Dokumente anbieten, die noch an keiner Rechnung hängen — ein Beleg
  // gehört zu genau einer Kostenposition, sonst zählt er doppelt.
  const attachableDocuments = useMemo(
    () => documents.filter((d) => !d.invoice_id),
    [documents]
  );

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setAttachedIds([]);
    // Nummer vorschlagen. Schlägt der Aufruf fehl, bleibt das Feld leer und
    // lässt sich von Hand füllen — der Dialog bleibt benutzbar.
    void nextSelfReceiptNumber().then((number) => {
      if (number) setForm((f) => ({ ...f, invoice_number: number }));
    });
    // nextSelfReceiptNumber ist stabil genug; nur beim Öffnen neu ziehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amountValue = Number(form.amount.replace(',', '.'));
  const canSave =
    form.company_name.trim().length > 0 &&
    form.invoice_date.length > 0 &&
    Number.isFinite(amountValue) &&
    amountValue > 0;

  const toggleAttached = (id: string) => {
    setAttachedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const companyName = form.company_name.trim();
      // Firma als echten FK mitführen wie beim Dokumenten-Weg, damit die
      // Firma→Gewerk-Kette und der Firmen-Merge auch hier greifen.
      const contractor = await findOrCreateByName(companyName);

      const invoice = await createInvoice({
        amount: amountValue,
        invoice_date: form.invoice_date,
        company_name: companyName,
        invoice_number: form.invoice_number.trim() || null,
        description: form.description.trim() || null,
        trade_id: form.trade_id || null,
        contractor_id: contractor?.id ?? null,
        is_gross: form.is_gross,
        is_self_receipt: true,
        ai_extracted: false,
        status: 'draft',
      });

      if (!invoice) return; // createInvoice hat bereits einen Fehler-Toast gezeigt

      // Belege anhängen: eine Anweisung für alle. updateDocument aus dem Hook
      // würde je Beleg einen eigenen Toast und einen eigenen Refetch auslösen —
      // bei einem Sammelbeleg mit sechs Quittungen also sechs von jedem.
      if (attachedIds.length > 0) {
        const { error } = await supabase
          .from('documents')
          .update({ invoice_id: invoice.id })
          .in('id', attachedIds);

        // Ein Fehlschlag hier verwirft den Beleg nicht: die Kosten sind
        // erfasst, die Zuordnung lässt sich in der Dokumentenverwaltung
        // nachtragen.
        if (error) {
          toast({
            title: 'Eigenbeleg angelegt, Belege nicht zugeordnet',
            description: `Die ${attachedIds.length} ausgewählten Belege konnten nicht verknüpft werden. Sie lassen sich in der Dokumentenverwaltung nachtragen.`,
            variant: 'destructive',
          });
        }
        await fetchDocuments();
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eigenbeleg anlegen</DialogTitle>
          <DialogDescription>
            Für Kosten ohne Fremdrechnung — Barzahlung, Eigenleistung, oder ein Sammelbeleg
            über mehrere Kleinbelege.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sr-company">Firma / Zweck *</Label>
              <Input
                id="sr-company"
                placeholder="z. B. Baumarkt Sammelbeleg"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-number">Belegnummer</Label>
              <Input
                id="sr-number"
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Fortlaufend vorgeschlagen, änderbar.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-date">Belegdatum *</Label>
              <Input
                id="sr-date"
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-amount">Betrag (EUR) *</Label>
              <Input
                id="sr-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Gewerk (optional)</Label>
              <TradeSelect
                value={form.trade_id || null}
                onValueChange={(v) => setForm({ ...form, trade_id: v || '' })}
                companyName={form.company_name}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sr-description">Beschreibung</Label>
              <Textarea
                id="sr-description"
                placeholder="Wofür wurde gezahlt? Bei einem Sammelbeleg: welche Einzelbelege stecken darin?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                id="sr-is-gross"
                checked={form.is_gross}
                onCheckedChange={(checked) => setForm({ ...form, is_gross: !!checked })}
              />
              <Label htmlFor="sr-is-gross" className="cursor-pointer">Betrag inkl. MwSt (brutto)</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Belege anhängen
              {attachedIds.length > 0 && (
                <span className="ml-2 text-muted-foreground">({attachedIds.length} ausgewählt)</span>
              )}
            </Label>
            {attachableDocuments.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Keine freien Dokumente vorhanden. Belege, die schon an einer Rechnung hängen,
                stehen hier nicht zur Auswahl.
              </p>
            ) : (
              <ScrollArea className="h-44 rounded-md border">
                <div className="space-y-1 p-2">
                  {attachableDocuments.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                    >
                      <Checkbox
                        checked={attachedIds.includes(doc.id)}
                        onCheckedChange={() => toggleAttached(doc.id)}
                      />
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{doc.title || doc.file_name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Wird angelegt…' : 'Eigenbeleg anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SelfReceiptDialog;
