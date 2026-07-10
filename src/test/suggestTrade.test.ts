import { describe, it, expect } from 'vitest';
import { suggestTradeForCompany } from '@/hooks/useTrades';

const trade = (id: string, contractorName: string | null) => ({
  id,
  contractor: contractorName ? { company_name: contractorName } : null,
});

// Firmen wie aus dem Excel-Seed ("Fa. …"); Rechnungen tragen die echten
// Namen aus den Belegen ("Mayerbau Bauunternehmung GmbH" etc.)
const trades = [
  trade('t-baust', 'Fa. Mayerbau'),
  trade('t-maurer', 'Fa. Mayerbau'),
  trade('t-erd', 'Fa. Steinegger'),
  trade('t-estrich', 'Fa. USH'),
  trade('t-tueren', 'Fa. Auer'),
  trade('t-boden', 'Fa. Kurz&Bauer'),
  trade('t-heizung', 'Fa. Neumeyer'),
  trade('t-bad', 'Fa. Neumeyer'),
  trade('t-metall', null),
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
});
