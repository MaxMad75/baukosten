

# Fix Plan: Comparison Page — Single Version Selector

## Problem

Lines 86-120 build a `families` map by grouping `allEstimates` via `parent_id`, then render one `<Select>` per family. This is the old model. Now there's one project with versions containing blocks — so there should be one single version selector.

Lines 117-120 use `getItemsByEstimateIds(ids)` which only gets legacy items by `estimate_id` — it misses block-linked items entirely.

## What to remove

- `families` useMemo (lines 86-98) — old per-family grouping
- `selectedVersions` state and its `useEffect` (lines 100-115) — replaced by single `selectedVersionId`
- `selectedEstimateItems` via `getItemsByEstimateIds` (lines 117-120) — wrong data source
- Multi-selector UI (lines 252-288) — replaced by single dropdown

## What to add

- Import `versions` and `estimateItems` (and `allEstimateItems`, `allBlocks`) from `useEstimates`
- Single state: `selectedVersionId` defaulting to `activeVersion?.id`
- Compute `selectedEstimateItems` by filtering `allEstimateItems` for items belonging to the selected version — using both paths:
  - block-linked: item has `block_id` where that block's `version_id` matches
  - legacy: item has no `block_id` but its `estimate_id` belongs to an `architect_estimate` with matching `version_id`
- Single `<Select>` showing all versions with names

## DetailPanel fix

Line 518 uses `toNetto(amount, i.is_gross)` for estimate items — should use `tax_status`-aware conversion (same `toBruttoTaxStatus` pattern but for netto). Add a `toNettoTaxStatus` helper alongside existing `toBruttoTaxStatus`.

Line 544 shows `is_gross ? 'brutto' : 'netto'` badge — should show tax_status label including "steuerfrei".

## useEstimates.ts

Already exposes `versions`, `activeVersion`, `allEstimateItems`, `allBlocks`, `allEstimates`. No new helpers needed — the filtering can be done in a `useMemo` inside Comparison.tsx.

## Files to change

| File | Change |
|------|--------|
| `src/pages/Comparison.tsx` | Replace families/multi-selector with single version selector; fix item source to include block-linked items; fix DetailPanel to use `tax_status` |

## Unchanged

- `useEstimates.ts` — already exposes everything needed
- All other pages, hooks, backup, schema
- Invoice/offer logic in Comparison — untouched
- Trade view and detail DIN view — same display, just correct data source

