import { describe, it, expect } from 'vitest';
import { suggestTradeForCompany, resolveInvoiceTradeId, resolveInvoiceBlockKey, tradeBlockKey } from '@/hooks/useTrades';

const trade = (id: string, contractorName: string | null, contractorId: string | null) => ({
  id,
  contractor_id: contractorId,
  contractor: contractorName ? { company_name: contractorName } : null,
});

// Firmen wie aus dem Excel-Seed ("Fa. …"); Rechnungen tragen die echten
// Namen aus den Belegen ("Mayerbau Bauunternehmung GmbH" etc.).
// Gleiche Firma ⇒ gleiche contractor_id (wie nach dem Firmen-Merge).
const trades = [
  trade('t-baust', 'Fa. Mayerbau', 'c-mayer'),
  trade('t-maurer', 'Fa. Mayerbau', 'c-mayer'),
  trade('t-erd', 'Fa. Steinegger', 'c-stein'),
  trade('t-estrich', 'Fa. USH', 'c-ush'),
  trade('t-tueren', 'Fa. Auer', 'c-auer'),
  trade('t-boden', 'Fa. Kurz&Bauer', 'c-kurz'),
  trade('t-heizung', 'Fa. Neumeyer', 'c-neumeyer'),
  trade('t-bad', 'Fa. Neumeyer', 'c-neumeyer'),
  trade('t-metall', null, null),
];

describe('suggestTradeForCompany (Firma→Gewerk-Regel, SRS 4.1)', () => {
  it('matcht direkt gegen den Firmennamen am Gewerk — auch bei abweichender Schreibweise auf der Rechnung', () => {
    // Das war der User-Bug 10.07.: "Mayerbau Bauunternehmung GmbH" fand
    // "Fa. Mayerbau" nicht, weil über die contractors-Liste gematcht wurde.
    const { trade: hit, candidates } = suggestTradeForCompany(trades, 'Mayerbau Bauunternehmung GmbH');
    expect(candidates.map((t) => t.id).sort()).toEqual(['t-baust', 't-maurer']);
    expect(hit).toBeNull(); // zwei Gewerke → keine Auto-Zuordnung, aber Kandidaten
  });

  it('ordnet automatisch zu, wenn die Firma genau ein Gewerk hat', () => {
    const { trade: hit } = suggestTradeForCompany(trades, 'Steinegger Bau GmbH & Co. KG');
    expect(hit?.id).toBe('t-erd');
  });

  it('ignoriert das "Fa."/"Firma"-Präfix in beide Richtungen', () => {
    expect(suggestTradeForCompany(trades, 'Fa. USH').trade?.id).toBe('t-estrich');
    expect(suggestTradeForCompany(trades, 'USH Estriche GmbH').trade?.id).toBe('t-estrich');
  });

  it('verwechselt Wort-Teiltreffer nicht (Auer vs. Kurz&Bauer)', () => {
    expect(suggestTradeForCompany(trades, 'Auer Türen GmbH').trade?.id).toBe('t-tueren');
    expect(suggestTradeForCompany(trades, 'Kurz&Bauer GmbH').trade?.id).toBe('t-boden');
  });

  it('liefert bei Firma mit mehreren Gewerken Kandidaten statt Auto-Zuordnung', () => {
    const { trade: hit, candidates } = suggestTradeForCompany(trades, 'Neumeyer Haustechnik');
    expect(hit).toBeNull();
    expect(candidates.map((t) => t.id).sort()).toEqual(['t-bad', 't-heizung']);
  });

  it('liefert bei unbekannter Firma weder Zuordnung noch Kandidaten', () => {
    const { trade: hit, candidates } = suggestTradeForCompany(trades, 'Unbekannte Firma XY');
    expect(hit).toBeNull();
    expect(candidates).toEqual([]);
  });

  it('überspringt Gewerke ohne Firma und leere Eingaben', () => {
    expect(suggestTradeForCompany(trades, '').candidates).toEqual([]);
    expect(suggestTradeForCompany(trades, '   ').candidates).toEqual([]);
  });

  it('nutzt die Firmen-ID (Dokument-Link) als stärkstes Signal, unabhängig vom Namen', () => {
    // Name würde nichts treffen — die ID entscheidet
    const { trade: hit } = suggestTradeForCompany(trades, 'Völlig anderer Name', 'c-ush');
    expect(hit?.id).toBe('t-estrich');
  });

  it('fällt bei unbekannter Firmen-ID auf das Namens-Matching zurück', () => {
    const { trade: hit } = suggestTradeForCompany(trades, 'USH Estriche GmbH', 'c-existiert-nicht');
    expect(hit?.id).toBe('t-estrich');
  });
});

describe('resolveInvoiceTradeId (implizite Zuordnung, User-Feedback 11.07.)', () => {
  it('lässt ein explizit gespeichertes Gewerk immer gewinnen', () => {
    expect(resolveInvoiceTradeId(trades, { trade_id: 't-erd', company_name: 'USH Estriche GmbH' })).toBe('t-erd');
  });

  it('ordnet implizit über die Firma zu, wenn kein Gewerk gespeichert ist', () => {
    expect(resolveInvoiceTradeId(trades, { trade_id: null, company_name: 'USH Estriche GmbH' })).toBe('t-estrich');
  });

  it('liefert null bei mehrdeutiger Firma (manuelle Wahl nötig)', () => {
    expect(resolveInvoiceTradeId(trades, { trade_id: null, company_name: 'Neumeyer Haustechnik' })).toBeNull();
  });

  it('ignoriert ein gespeichertes Gewerk, das nicht (mehr) existiert, und löst neu auf', () => {
    expect(resolveInvoiceTradeId(trades, { trade_id: 't-geloescht', company_name: 'USH Estriche GmbH' })).toBe('t-estrich');
  });
});

describe('resolveInvoiceBlockKey (Firmen-Block, User-Feedback 11.07.)', () => {
  it('ordnet Rechnungen einer Firma mit MEHREREN Gewerken dem Firmen-Block zu — keine Gewerk-Wahl nötig', () => {
    // Neumeyer hat zwei Gewerke → resolveInvoiceTradeId wäre null,
    // der Firmen-Block nimmt die Rechnung trotzdem auf.
    expect(resolveInvoiceBlockKey(trades, { trade_id: null, company_name: 'Neumeyer Haustechnik' }))
      .toBe('c:c-neumeyer');
  });

  it('explizites trade_id bestimmt den Block des Gewerks', () => {
    expect(resolveInvoiceBlockKey(trades, { trade_id: 't-metall', company_name: 'Egal GmbH' }))
      .toBe(tradeBlockKey(trades.find((t) => t.id === 't-metall')!));
  });

  it('nutzt die Dokument-Firmen-ID, wenn diese Firma Gewerke hat', () => {
    expect(resolveInvoiceBlockKey(trades, { trade_id: null, company_name: 'Anderer Name' }, 'c-neumeyer'))
      .toBe('c:c-neumeyer');
  });

  it('der Firmen-FK der Rechnung schlägt Dokument-Link und Namens-Match', () => {
    expect(resolveInvoiceBlockKey(
      trades,
      { trade_id: null, company_name: 'USH Estriche GmbH', contractor_id: 'c-neumeyer' },
      'c-ush'
    )).toBe('c:c-neumeyer');
  });

  it('liefert null, wenn die Firma kein Gewerk im Budget hat', () => {
    expect(resolveInvoiceBlockKey(trades, { trade_id: null, company_name: 'Architekt Schmidmaier' })).toBeNull();
  });

  it('Gewerk ohne Firma bildet seinen eigenen Block', () => {
    const metall = trades.find((t) => t.id === 't-metall')!;
    expect(tradeBlockKey(metall)).toBe('t:t-metall');
  });
});
