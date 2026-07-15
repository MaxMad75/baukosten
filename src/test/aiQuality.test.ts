import { describe, it, expect } from 'vitest';
import { computeAiQuality, AiQualityPair } from '@/lib/aiQuality';

const pair = (raw: AiQualityPair['raw'], final: Partial<AiQualityPair['final']>): AiQualityPair => ({
  raw,
  final: {
    company_name: 'Mayer Hochbau GmbH',
    invoice_number: 'RE-100',
    amount: 1000,
    invoice_date: '2026-07-01',
    ...final,
  },
});

describe('computeAiQuality (KI-Eval, SRS 4.3)', () => {
  it('zählt exakte Treffer je Feld', () => {
    const fields = computeAiQuality([
      pair(
        { company_name: 'Mayer Hochbau GmbH', invoice_number: 'RE-100', amount: 1000, invoice_date: '2026-07-01' },
        {}
      ),
    ]);
    expect(fields.every((f) => f.correct === 1 && f.total === 1)).toBe(true);
  });

  it('wertet Firmennamen tolerant ("Fa."-Präfix, Teilnamen), Beträge nur exakt (±1 Cent)', () => {
    const fields = computeAiQuality([
      pair(
        { company_name: 'Fa. Mayer Hochbau', invoice_number: 're-100', amount: 999, invoice_date: '2026-07-02' },
        {}
      ),
    ]);
    const byField = new Map(fields.map((f) => [f.field, f]));
    expect(byField.get('company_name')?.correct).toBe(1);   // Präfix/Teilname toleriert
    expect(byField.get('invoice_number')?.correct).toBe(1); // case-insensitive
    expect(byField.get('amount')?.correct).toBe(0);         // 999 ≠ 1000
    expect(byField.get('invoice_date')?.correct).toBe(0);   // falscher Tag
  });

  it('bewertet die Rechnungsnummer nur, wenn die finale Rechnung eine hat', () => {
    const fields = computeAiQuality([
      pair({ company_name: null, amount: null, invoice_date: null, invoice_number: null }, { invoice_number: null }),
    ]);
    const byField = new Map(fields.map((f) => [f.field, f]));
    expect(byField.get('invoice_number')?.total).toBe(0);
    expect(byField.get('amount')?.total).toBe(1);
    expect(byField.get('amount')?.correct).toBe(0); // KI hat nichts geliefert
  });

  it('liefert bei leerer Basis überall 0/0', () => {
    expect(computeAiQuality([]).every((f) => f.total === 0 && f.correct === 0)).toBe(true);
  });
});
