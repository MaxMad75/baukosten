

# Estimate Item Tax Status: Minimal Implementation Plan

## Problem

`calcNetto` and `calcBrutto` always apply 19% VAT conversion. Items like "Grundstück" or "Notar" are VAT-free but currently get a false VAT component calculated, inflating MwSt totals.

## Schema change

**Alter `architect_estimate_items`**: Add column `tax_status text NOT NULL DEFAULT 'net'`.

**Data migration** (in same migration):
```sql
UPDATE architect_estimate_items
SET tax_status = CASE WHEN is_gross THEN 'gross' ELSE 'net' END;
```

The `is_gross` column is kept for now (no drop) to avoid breaking backup/restore or edge function output parsing. New code reads `tax_status` only.

Valid values: `'net'`, `'gross'`, `'tax_free'`

## Core logic changes

Replace the two helper functions and `computeVatSummary` to handle three states:

```ts
type TaxStatus = 'net' | 'gross' | 'tax_free';

const calcNetto = (amount: number, status: TaxStatus) =>
  status === 'gross' ? amount / 1.19 : amount; // tax_free and net are already net-equivalent

const calcBrutto = (amount: number, status: TaxStatus) =>
  status === 'net' ? amount * 1.19 : amount; // tax_free and gross are already brutto-equivalent
```

For `tax_free`: amount contributes fully to both netto and brutto (no VAT delta).

## Files to change

| File | Change |
|------|--------|
| Migration SQL | Add `tax_status` column, migrate from `is_gross`, default `'net'` |
| `src/lib/types.ts` | Add `tax_status` field to `ArchitectEstimateItem`, add `TaxStatus` type |
| `src/pages/Estimates.tsx` | Replace `calcNetto`/`calcBrutto`/`computeVatSummary` to use `tax_status`. Replace all `is_gross` checkbox UI with a 3-option select (Brutto/Netto/Steuerfrei). Update all item form state from `is_gross: boolean` to `tax_status: TaxStatus`. |
| `src/pages/Comparison.tsx` | Update `toBrutto`/`toNetto` to handle `tax_status` on estimate items (keep `is_gross` path for invoices/offers unchanged) |
| `src/hooks/useEstimates.ts` | Pass `tax_status` through `addBlockItems`, `addEstimateItems`, `updateEstimateItem`. Derive `is_gross` from `tax_status` for backward compat on insert (so the old column stays consistent). |
| `src/utils/backup/types.ts` | Add `tax_status` to `BackupEstimateItem` (nullable for old backups) |
| `src/utils/backup/export.ts` | Include `tax_status` in exported items |
| `src/utils/backup/import.ts` | Map `tax_status` on import; fall back to deriving from `is_gross` for old backups |

## Unchanged

- `architect_estimate_items.is_gross` column: kept, not dropped
- Invoice tax handling (`invoices.is_gross`): unchanged
- Offer tax handling: unchanged
- Dashboard, Settings, Auth, Documents, Contractors, Journal pages
- Edge functions (`analyze-estimate` output still uses `is_gross` — mapped to `tax_status` in UI layer)
- `estimate_versions`, `estimate_blocks` tables

## Deferred

- Dropping the `is_gross` column from `architect_estimate_items` (later cleanup)
- Extending `tax_free` to invoices or offers
- Updating the `analyze-estimate` edge function output schema

