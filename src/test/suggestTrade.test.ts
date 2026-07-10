import { describe, it, expect } from 'vitest';
import { suggestTradeForCompany } from '@/hooks/useTrades';
import { Contractor } from '@/lib/types';

const mkContractor = (id: string, company_name: string): Contractor => ({
  id,
  household_id: 'h1',
  company_name,
  trade: null,
  contact_person: null,
  phone: null,
  email: null,
  website: null,
  notes: null,
  rating: null,
  created_at: '',
  updated_at: '',
});

const contractors = [
  mkContractor('c-mayer', 'Fa. Mayerbau'),
  mkContractor('c-neumeyer', 'Fa. Neumeyer'),
  mkContractor('c-josko', 'Fa. Josko'),
];

const trades = [
  { id: 't-erd', contractor_id: 'c-steinegger' },
  { id: 't-maurer', contractor_id: 'c-mayer' },
  { id: 't-heizung', contractor_id: 'c-neumeyer' },
  { id: 't-bad', contractor_id: 'c-neumeyer' },
  { id: 't-metall', contractor_id: null },
];

describe('suggestTradeForCompany (Firma→Gewerk-Regel, SRS 4.1)', () => {
  it('ordnet bei genau einem Gewerk der Firma eindeutig zu', () => {
    const { trade, candidates } = suggestTradeForCompany(trades, contractors, 'Fa. Mayerbau');
    expect(trade?.id).toBe('t-maurer');
    expect(candidates.map((t) => t.id)).toEqual(['t-maurer']);
  });

  it('matcht Firmennamen-Varianten über das Contractor-Matching', () => {
    // Rechnung nennt "Mayerbau GmbH", contractor heißt "Fa. Mayerbau"
    const { trade } = suggestTradeForCompany(trades, contractors, 'Fa. Mayerbau GmbH');
    expect(trade?.id).toBe('t-maurer');
  });

  it('liefert bei mehreren Gewerken derselben Firma nur Kandidaten, keine Auto-Zuordnung', () => {
    const { trade, candidates } = suggestTradeForCompany(trades, contractors, 'Fa. Neumeyer');
    expect(trade).toBeNull();
    expect(candidates.map((t) => t.id).sort()).toEqual(['t-bad', 't-heizung']);
  });

  it('liefert bei unbekannter Firma weder Zuordnung noch Kandidaten', () => {
    const { trade, candidates } = suggestTradeForCompany(trades, contractors, 'Unbekannte Firma XY');
    expect(trade).toBeNull();
    expect(candidates).toEqual([]);
  });

  it('ordnet nicht zu, wenn die gematchte Firma an keinem Gewerk hängt', () => {
    const { trade, candidates } = suggestTradeForCompany(trades, contractors, 'Fa. Josko');
    expect(trade).toBeNull();
    expect(candidates).toEqual([]);
  });
});
