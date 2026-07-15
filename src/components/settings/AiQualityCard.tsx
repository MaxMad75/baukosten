import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sparkles } from 'lucide-react';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvoices } from '@/hooks/useInvoices';
import { computeAiQuality, AiRawInvoiceFields } from '@/lib/aiQuality';

/**
 * KI-Erkennungsqualität (SRS 4.3/R4.2): vergleicht das gespeicherte
 * KI-Rohergebnis jeder analysierten Rechnung mit den finalen, geprüften
 * Werten — die Messbasis, um Prompt-Änderungen zu bewerten.
 */
export const AiQualityCard: React.FC = () => {
  const { documents } = useDocuments();
  const { invoices } = useInvoices();

  const quality = useMemo(() => {
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const pairs = documents
      .filter((d) => d.ai_raw_result && d.invoice_id && invoiceById.has(d.invoice_id))
      .map((d) => {
        const inv = invoiceById.get(d.invoice_id!)!;
        return {
          raw: d.ai_raw_result as AiRawInvoiceFields,
          final: {
            company_name: inv.company_name,
            invoice_number: inv.invoice_number,
            amount: Number(inv.amount),
            invoice_date: inv.invoice_date,
          },
        };
      });
    return { fields: computeAiQuality(pairs), sampleSize: pairs.length };
  }, [documents, invoices]);

  if (quality.sampleSize === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          KI-Erkennungsqualität
        </CardTitle>
        <CardDescription>
          Wie oft die automatische Extraktion mit den final geprüften Rechnungswerten übereinstimmt
          — Basis: {quality.sampleSize} analysierte Rechnung{quality.sampleSize === 1 ? '' : 'en'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {quality.fields.filter((f) => f.total > 0).map((f) => {
          const pct = Math.round((f.correct / f.total) * 100);
          return (
            <div key={f.field} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{f.label}</span>
                <span className="text-muted-foreground">{f.correct} / {f.total} ({pct} %)</span>
              </div>
              <Progress value={pct} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
