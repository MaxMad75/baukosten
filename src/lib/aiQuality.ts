/**
 * KI-Eval (SRS 4.3/R4.2): Erkennungsquote der Rechnungs-Extraktion, gemessen
 * am gespeicherten Roh-Ergebnis (documents.ai_raw_result) gegen die finalen,
 * vom Bauherrn geprüften Rechnungswerte. Pure Logik, unit-testbar — die
 * Grundlage, um Prompt-Änderungen vorher/nachher zu vergleichen.
 */

export interface AiRawInvoiceFields {
  company_name?: string | null;
  invoice_number?: string | null;
  amount?: number | null;
  invoice_date?: string | null;
}

export interface AiQualityPair {
  raw: AiRawInvoiceFields;
  final: {
    company_name: string;
    invoice_number: string | null;
    amount: number;
    invoice_date: string;
  };
}

export interface AiQualityField {
  field: 'company_name' | 'invoice_number' | 'amount' | 'invoice_date';
  label: string;
  /** KI-Wert stimmte mit dem finalen Wert überein */
  correct: number;
  /** Paare, in denen das Feld bewertbar war */
  total: number;
}

const cleanName = (s: string) =>
  s.toLowerCase().replace(/^\s*(fa\.?|firma)\s+/i, '').replace(/\s+/g, ' ').trim();

const namesMatch = (a: string, b: string): boolean => {
  const ca = cleanName(a);
  const cb = cleanName(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
};

export function computeAiQuality(pairs: AiQualityPair[]): AiQualityField[] {
  const fields: AiQualityField[] = [
    { field: 'company_name', label: 'Firma', correct: 0, total: 0 },
    { field: 'invoice_number', label: 'Rechnungsnummer', correct: 0, total: 0 },
    { field: 'amount', label: 'Betrag', correct: 0, total: 0 },
    { field: 'invoice_date', label: 'Datum', correct: 0, total: 0 },
  ];
  const [company, number, amount, date] = fields;

  for (const { raw, final } of pairs) {
    // Firma/Betrag/Datum sind an der finalen Rechnung immer vorhanden
    company.total += 1;
    if (raw.company_name && namesMatch(raw.company_name, final.company_name)) company.correct += 1;

    amount.total += 1;
    if (raw.amount != null && Math.abs(Number(raw.amount) - Number(final.amount)) <= 0.01) amount.correct += 1;

    date.total += 1;
    if (raw.invoice_date && raw.invoice_date === final.invoice_date) date.correct += 1;

    // Rechnungsnummer nur bewerten, wenn final eine existiert
    if (final.invoice_number && final.invoice_number.trim() !== '') {
      number.total += 1;
      if (raw.invoice_number && raw.invoice_number.trim().toLowerCase() === final.invoice_number.trim().toLowerCase()) {
        number.correct += 1;
      }
    }
  }

  return fields;
}
