import React, { useMemo } from 'react';
import { useTrades } from '@/hooks/useTrades';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TradeSection, TradeWithEstimates, TRADE_SECTION_LABELS } from '@/lib/types';

const NONE_VALUE = 'none';

interface TradeSelectProps {
  /** trade_id oder ''/null für „kein Gewerk" */
  value: string | null;
  onValueChange: (tradeId: string | null) => void;
  placeholder?: string;
}

/**
 * Gewerk-Auswahl (SRS 4.1): geschlossene Liste der Gewerke des Haushalts,
 * gruppiert nach DIN-Abschnitt — ersetzt die offene DIN-276-Auswahl als
 * primäre Zuordnung von Rechnungen. Blendet sich aus, solange die
 * Gewerke-Tabellen fehlen (defensiv, Arbeitsvereinbarung 8.2).
 */
export const TradeSelect: React.FC<TradeSelectProps> = ({ value, onValueChange, placeholder = 'Gewerk wählen…' }) => {
  const { trades, loading, available } = useTrades();

  const sections = useMemo(() => {
    const map = new Map<TradeSection, TradeWithEstimates[]>();
    for (const trade of trades) {
      const list = map.get(trade.section) || [];
      list.push(trade);
      map.set(trade.section, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [trades]);

  if (!available) return null;

  return (
    <Select
      value={value || NONE_VALUE}
      onValueChange={(v) => onValueChange(v === NONE_VALUE ? null : v)}
      disabled={loading}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? 'Laden…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>
          <span className="text-muted-foreground">Kein Gewerk</span>
        </SelectItem>
        {sections.map(([section, sectionTrades]) => (
          <SelectGroup key={section}>
            <SelectLabel>{section} · {TRADE_SECTION_LABELS[section]}</SelectLabel>
            {sectionTrades.map((trade) => (
              <SelectItem key={trade.id} value={trade.id}>{trade.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};
