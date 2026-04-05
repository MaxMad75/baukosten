

# Trade-Level Comparison View — Revised Plan (Deterministic Mapping)

## Overview

Introduce a static, fully explicit trade mapping that groups DIN-based comparison rows into pragmatic trade nodes. Every mapping rule uses exact codes or exact prefix matching. No vague subsets or inferred semantics.

## New file: `src/lib/tradeMapping.ts`

### Interface

```ts
interface TradeNode {
  id: string;
  label: string;
  codes: string[];  // exact DIN codes (level 2 or 3) that match this trade
}
```

### Matching rule

A comparison row with code `X` matches a trade node if:
1. `X` is listed in the node's `codes` array, OR
2. `X`'s level-2 parent (from kostengruppen data) is listed in the node's `codes` array

If no match is found, the row goes to "Sonstiges".

### Initial trade nodes (deterministic, exact codes only)

| id | label | codes (exact) |
|---|---|---|
| `erdarbeiten` | Erdarbeiten | `["310"]` |
| `gruendung` | Gründung / Unterbau | `["320"]` |
| `rohbau` | Rohbau (Wände, Decken) | `["330", "340", "350"]` |
| `dach` | Dach / Zimmerer | `["360"]` |
| `sanitaer` | Sanitär (Abwasser, Wasser, Gas) | `["410"]` |
| `heizung` | Heizung | `["420"]` |
| `lueftung` | Wohnraumlüftung | `["430"]` |
| `elektro` | Elektro | `["440"]` |
| `aussenanlagen` | Außenanlagen | `["500"]` |
| `baunebenkosten` | Baunebenkosten | `["700"]` |

Codes **not** covered (e.g. 100, 200, 370, 390, 450-490, 600, 800) fall into the automatic "Sonstiges" catch-all.

This is deliberately conservative. Trade nodes like "Fenster + Eingangstüren" or "Bodenbeläge + Treppe" require level-3 code splitting within a single level-2 parent (e.g. 334 from 330) — those are deferred to a later phase to keep this mapping unambiguous.

### Helper function

```ts
function getTradeForCode(code: string, parentCode: string | null): string
```

Returns the `id` of the matching trade node, or `"sonstiges"`.

## Changes in `src/pages/Comparison.tsx`

### 1. New interface

```ts
interface TradeComparisonGroup {
  tradeId: string;
  tradeLabel: string;
  estimatedBrutto: number;
  actualBrutto: number;
  difference: number;
  percentage: number;
  offerBrutto: number;
  offerVsEstimate: number;
  children: ComparisonRow[];
}
```

### 2. New `tradeComparisons` memo

After existing `comparisons` memo:
- For each `ComparisonRow`, resolve its trade using `getTradeForCode(row.code, kostengruppeByCode?.parent_code)`
- Group rows by trade, aggregate sums for all numeric fields
- Compute `percentage` from aggregated `difference / estimatedBrutto`

### 3. View toggle

```ts
const [viewMode, setViewMode] = useState<'trades' | 'detail'>('trades');
```

Two small buttons/tabs above the table: **Gewerke** (default) | **Detail (DIN 276)**.

### 4. UI rendering

- `trades` mode: render `TradeComparisonGroup` rows, each collapsible to show child `ComparisonRow` details
- `detail` mode: existing flat table, unchanged

### 5. Totals memo unchanged

Existing `totals` reduces over flat `comparisons` — stays as-is.

## Files

| File | Change |
|---|---|
| `src/lib/tradeMapping.ts` | New — trade node definitions + `getTradeForCode` helper |
| `src/pages/Comparison.tsx` | Import mapping, add `tradeComparisons` memo, view toggle, grouped rendering |

## Unchanged

- Database schema — no migration
- All hooks (`useKostengruppen`, `useEstimates`, `useInvoices`, `useOffers`, `useInvoiceAllocations`)
- `comparisons` memo and `ComparisonRow` interface — kept intact as data source
- All other pages
- Auth, backup/restore, invoice payments, estimate versioning

