import React, { useEffect, useMemo, useState } from 'react';
import { useTrades, suggestTradeForCompany } from '@/hooks/useTrades';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TradeSection, TradeWithEstimates, TRADE_SECTION_LABELS } from '@/lib/types';

const NONE_VALUE = 'none';
const SHOW_ALL_VALUE = 'show-all';

interface TradeSelectProps {
  /** trade_id oder ''/null für „kein Gewerk" */
  value: string | null;
  onValueChange: (tradeId: string | null) => void;
  placeholder?: string;
  /**
   * Firma der Rechnung: schränkt die Auswahl auf die Gewerke dieser Firma
   * ein (SRS 4.1 Punkt 2) — der Bauherr muss nicht beurteilen, welches der
   * 28 Gewerke gemeint ist, sondern wählt nur zwischen den Gewerken der
   * Firma. „Alle Gewerke anzeigen" hebt die Einschränkung auf.
   */
  companyName?: string;
  /** Firmen-ID (z. B. vom verknüpften Dokument) — stärker als der Name */
  contractorId?: string | null;
}

/**
 * Gewerk-Auswahl (SRS 4.1): geschlossene Gewerkliste, nach DIN-Abschnitt
 * gruppiert; mit companyName eingeschränkt auf die Gewerke der gematchten
 * Firma. Blendet sich aus, solange die Gewerke-Tabellen fehlen (defensiv).
 */
export const TradeSelect: React.FC<TradeSelectProps> = ({ value, onValueChange, placeholder = 'Gewerk wählen…', companyName, contractorId }) => {
  const { trades, loading, available } = useTrades();
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
  }, [companyName, contractorId]);

  const candidates = useMemo(() => {
    if (!companyName?.trim() && !contractorId) return [];
    return suggestTradeForCompany(trades, companyName?.trim() || '', contractorId).candidates;
  }, [trades, companyName, contractorId]);

  const matchedContractorName = candidates[0]?.contractor?.company_name || null;

  const restricted = !showAll && candidates.length > 0;

  // Ein bereits zugeordnetes Gewerk außerhalb der Firmen-Kandidaten bleibt sichtbar
  const restrictedTrades = useMemo(() => {
    if (value && !candidates.some((t) => t.id === value)) {
      const selected = trades.find((t) => t.id === value);
      return selected ? [...candidates, selected] : candidates;
    }
    return candidates;
  }, [candidates, trades, value]);

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
      onValueChange={(v) => {
        if (v === SHOW_ALL_VALUE) {
          setShowAll(true);
          return;
        }
        onValueChange(v === NONE_VALUE ? null : v);
      }}
      disabled={loading}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? 'Laden…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>
          <span className="text-muted-foreground">Kein Gewerk</span>
        </SelectItem>
        {restricted ? (
          <>
            <SelectGroup>
              <SelectLabel>Gewerke von {matchedContractorName || companyName}</SelectLabel>
              {restrictedTrades.map((trade) => (
                <SelectItem key={trade.id} value={trade.id}>{trade.name}</SelectItem>
              ))}
            </SelectGroup>
            <SelectItem value={SHOW_ALL_VALUE}>
              <span className="text-muted-foreground">Alle Gewerke anzeigen…</span>
            </SelectItem>
          </>
        ) : (
          sections.map(([section, sectionTrades]) => (
            <SelectGroup key={section}>
              <SelectLabel>{section} · {TRADE_SECTION_LABELS[section]}</SelectLabel>
              {sectionTrades.map((trade) => (
                <SelectItem key={trade.id} value={trade.id}>{trade.name}</SelectItem>
              ))}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  );
};
