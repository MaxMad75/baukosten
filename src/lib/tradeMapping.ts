export interface TradeNode {
  id: string;
  label: string;
  /** Exact DIN level-2 codes that map to this trade */
  codes: string[];
}

export const TRADE_NODES: TradeNode[] = [
  { id: 'erdarbeiten', label: 'Erdarbeiten', codes: ['310'] },
  { id: 'gruendung', label: 'Gründung / Unterbau', codes: ['320'] },
  { id: 'rohbau', label: 'Rohbau (Wände, Decken)', codes: ['330', '340', '350'] },
  { id: 'dach', label: 'Dach / Zimmerer', codes: ['360'] },
  { id: 'sanitaer', label: 'Sanitär (Abwasser, Wasser, Gas)', codes: ['410'] },
  { id: 'heizung', label: 'Heizung', codes: ['420'] },
  { id: 'lueftung', label: 'Wohnraumlüftung', codes: ['430'] },
  { id: 'elektro', label: 'Elektro', codes: ['440'] },
  { id: 'aussenanlagen', label: 'Außenanlagen', codes: ['500'] },
  { id: 'baunebenkosten', label: 'Baunebenkosten', codes: ['700'] },
];

const SONSTIGES_ID = 'sonstiges';
const SONSTIGES_LABEL = 'Sonstiges';

// Build a lookup: code → tradeId
const codeLookup = new Map<string, string>();
for (const node of TRADE_NODES) {
  for (const code of node.codes) {
    codeLookup.set(code, node.id);
  }
}

/**
 * Resolve which trade a DIN code belongs to.
 * 1. Check the code itself against the trade mapping
 * 2. Check its parent_code (level-2 parent for level-3 codes)
 * 3. Fall back to "sonstiges"
 */
export function getTradeForCode(code: string, parentCode: string | null): string {
  if (codeLookup.has(code)) return codeLookup.get(code)!;
  if (parentCode && codeLookup.has(parentCode)) return codeLookup.get(parentCode)!;
  return SONSTIGES_ID;
}

export function getTradeLabel(tradeId: string): string {
  if (tradeId === SONSTIGES_ID) return SONSTIGES_LABEL;
  return TRADE_NODES.find(n => n.id === tradeId)?.label ?? SONSTIGES_LABEL;
}
