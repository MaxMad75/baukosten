/**
 * Excel-Import der Architekten-Kostenberechnung (SRS 4.1/R1.5, Story C7):
 * deterministischer Namensabgleich der Excel-Zeilen gegen die bestehenden
 * Gewerke — keine KI nötig, die Gewerk-Namen stammen aus demselben Excel.
 * Arbeitet auf rohen Zellzeilen (string|number|null), damit die Logik ohne
 * xlsx-Library unit-testbar bleibt.
 */

export type SheetCell = string | number | null | undefined;
export type SheetRows = SheetCell[][];

export interface ImportTradeRef {
  id: string;
  name: string;
}

export interface MatchedRow {
  tradeId: string;
  tradeName: string;
  rowIndex: number;
  /** Spaltenindex → Zahlwert der Zeile */
  values: Map<number, number>;
}

export interface ColumnCandidate {
  colIndex: number;
  /** nächstgelegene Textzelle oberhalb der ersten Datenzeile (Spaltenkopf) */
  label: string | null;
  /** Anzahl Gewerk-Zeilen mit Zahl in dieser Spalte */
  matchCount: number;
  sum: number;
}

export interface SheetAnalysis {
  matched: MatchedRow[];
  /** Gewerke, zu denen keine Excel-Zeile gefunden wurde */
  unmatchedTrades: ImportTradeRef[];
  /** Wertspalten, sortiert nach Trefferzahl */
  columns: ColumnCandidate[];
}

/** Whitespace-/Interpunktions-tolerant: "Fliesenlege - und ..." ≡ "Fliesenlege- und ..." */
export const normalizeTradeName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

/**
 * Zeilen eines Tabellenblatts gegen die Gewerkliste abgleichen und die
 * Wertspalten ermitteln. Pro Gewerk zählt die erste passende Zeile.
 */
export function analyzeSheet(rows: SheetRows, trades: ImportTradeRef[]): SheetAnalysis {
  const byNormalizedName = new Map<string, ImportTradeRef>();
  for (const trade of trades) {
    const key = normalizeTradeName(trade.name);
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, trade);
  }

  const matched: MatchedRow[] = [];
  const seenTradeIds = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const textCell = row.find((cell): cell is string => typeof cell === 'string' && cell.trim() !== '');
    if (!textCell) return;
    const trade = byNormalizedName.get(normalizeTradeName(textCell));
    if (!trade || seenTradeIds.has(trade.id)) return;

    const values = new Map<number, number>();
    row.forEach((cell, colIndex) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) values.set(colIndex, cell);
    });
    if (values.size === 0) return;

    seenTradeIds.add(trade.id);
    matched.push({ tradeId: trade.id, tradeName: trade.name, rowIndex, values });
  });

  const columnStats = new Map<number, { matchCount: number; sum: number }>();
  for (const row of matched) {
    for (const [colIndex, value] of row.values) {
      const stat = columnStats.get(colIndex) || { matchCount: 0, sum: 0 };
      stat.matchCount += 1;
      stat.sum += value;
      columnStats.set(colIndex, stat);
    }
  }

  const firstDataRow = matched.length > 0 ? Math.min(...matched.map((m) => m.rowIndex)) : 0;
  const columns: ColumnCandidate[] = Array.from(columnStats.entries())
    .map(([colIndex, stat]) => {
      let label: string | null = null;
      for (let r = firstDataRow - 1; r >= 0; r--) {
        const cell = rows[r]?.[colIndex];
        if (typeof cell === 'string' && cell.trim() !== '') {
          label = cell.trim();
          break;
        }
      }
      return { colIndex, label, matchCount: stat.matchCount, sum: stat.sum };
    })
    .sort((a, b) => b.matchCount - a.matchCount || a.colIndex - b.colIndex);

  const unmatchedTrades = trades.filter((t) => !seenTradeIds.has(t.id));

  return { matched, unmatchedTrades, columns };
}

/** "Kostenberechnung vom 02.03.2026" → "2026-03-02" */
export function parseDateFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const m = label.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
