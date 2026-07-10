import { describe, it, expect } from 'vitest';
import { analyzeSheet, normalizeTradeName, parseDateFromLabel, SheetRows } from '@/lib/estimateImport';

const trades = [
  { id: 't-baust', name: 'Baustelleneinrichtung' },
  { id: 't-erd', name: 'Erdarbeiten' },
  { id: 't-fliesen', name: 'Fliesenlege- und Natursteinarbeiten' },
  { id: 't-kueche', name: 'Küche' },
];

// Struktur wie Tabelle2 des Architekten-Excels: Titelzeilen, Kopfzeile mit
// Versions-Labels, Gewerk-Zeilen mit mehreren Wertspalten, Summenzeile.
const rows: SheetRows = [
  ['Kostenverfolgung Neubau', null, null, null],
  [null, 'Zusammenfassung', null, null],
  ['1.', 'Bauwerk - Baukonstruktion', 'Kostenberechnung vom 02.03.2026', 'Kostenberechnung vom 12.12.2025'],
  [null, 'Baustelleneinrichtung', 20650, 31400],
  [null, 'Erdarbeiten', 30557.5, 31557.5],
  // Excel schreibt den Namen mit Leerzeichen um den Bindestrich
  [null, 'Fliesenlege - und Natursteinarbeiten', 22825, 31125],
  [null, 'Unbekanntes Gewerk XY', 999, 999],
  [null, null, 74032.5, 94082.5],
];

describe('normalizeTradeName', () => {
  it('ist tolerant gegenüber Leerzeichen und Interpunktion', () => {
    expect(normalizeTradeName('Fliesenlege - und Natursteinarbeiten'))
      .toBe(normalizeTradeName('Fliesenlege- und Natursteinarbeiten'));
  });
});

describe('analyzeSheet', () => {
  const analysis = analyzeSheet(rows, trades);

  it('matcht Gewerk-Zeilen über den Namen (inkl. Schreibvarianten)', () => {
    expect(analysis.matched.map((m) => m.tradeId)).toEqual(['t-baust', 't-erd', 't-fliesen']);
  });

  it('listet Gewerke ohne Excel-Zeile als unmatched', () => {
    expect(analysis.unmatchedTrades.map((t) => t.id)).toEqual(['t-kueche']);
  });

  it('erkennt die Wertspalten mit Kopfzeilen-Label und Summe', () => {
    const col2 = analysis.columns.find((c) => c.colIndex === 2);
    expect(col2?.label).toBe('Kostenberechnung vom 02.03.2026');
    expect(col2?.matchCount).toBe(3);
    expect(col2?.sum).toBeCloseTo(20650 + 30557.5 + 22825, 2);
  });

  it('ignoriert Zeilen ohne Gewerk-Treffer (Summen, fremde Zeilen)', () => {
    // Die Summenzeile und "Unbekanntes Gewerk XY" tauchen nicht als Match auf,
    // ihre Werte fließen nicht in die Spaltensummen ein.
    const col3 = analysis.columns.find((c) => c.colIndex === 3);
    expect(col3?.sum).toBeCloseTo(31400 + 31557.5 + 31125, 2);
  });

  it('nimmt pro Gewerk nur die erste passende Zeile', () => {
    const duplicated: SheetRows = [
      [null, 'Erdarbeiten', 100, null],
      [null, 'Erdarbeiten', 200, null],
    ];
    const a = analyzeSheet(duplicated, trades);
    expect(a.matched).toHaveLength(1);
    expect(a.matched[0].values.get(2)).toBe(100);
  });
});

describe('parseDateFromLabel', () => {
  it('extrahiert das Datum aus dem Versions-Label', () => {
    expect(parseDateFromLabel('Kostenberechnung vom 02.03.2026')).toBe('2026-03-02');
    expect(parseDateFromLabel('KB 2.3.2026')).toBe('2026-03-02');
  });
  it('liefert null ohne Datum', () => {
    expect(parseDateFromLabel('günstigste oder beauftragt')).toBeNull();
    expect(parseDateFromLabel(null)).toBeNull();
  });
});
