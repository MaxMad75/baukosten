

# Estimate Version Comparison Plan (Refined)

## Comparison-Selection Rules

1. **Union of selected versions**: The Soll column is computed from the union of estimate items across all selected versions — one selected version per family.
2. **One version per family**: Component state holds a `Record<string, string>` mapping root estimate ID → selected version ID. Exactly one version is selected per family at all times.
3. **Default = active**: On mount, each family's selection defaults to whichever version has `is_active === true`.
4. **Empty versions are valid**: A selected version with zero estimate items contributes nothing to Soll but remains selectable in the dropdown.
5. **Actuals unchanged**: The invoice/allocation side is completely untouched — same `getEffectiveAllocations` logic as today.
6. **Exclusive source**: Soll values come exclusively from the selected versions' items. No mixing with the global `activeEstimateItems`. The `comparisons` useMemo replaces its current `estimateItems` input with items fetched via `getItemsByEstimateIds(Object.values(selectedVersions))`.

## Changes

### `src/hooks/useEstimates.ts`
- Add `getItemsByEstimateIds(ids: string[]): ArchitectEstimateItem[]` — filters `allEstimateItems` (the full set, not just active) by the given estimate IDs

### `src/pages/Comparison.tsx`
- Derive estimate families from `allEstimates` (group by `parent_id || id`)
- Add local state: `selectedVersions: Record<string, string>` initialized from active versions
- Render a version selector per family above the comparison table (small Select dropdowns showing version number + file name)
- Replace the current `estimateItems` usage in the `comparisons` useMemo with items from `getItemsByEstimateIds(Object.values(selectedVersions))`
- All per-KG and total Soll values derive solely from this filtered set

## Files

| File | Change |
|------|--------|
| `src/hooks/useEstimates.ts` | Add `getItemsByEstimateIds` helper |
| `src/pages/Comparison.tsx` | Version selector UI + derive Soll from selected versions only |

## Unchanged
- Invoice payments, allocations, splits, status model
- Estimate DB schema, `is_active` semantics, Estimates page
- Dashboard, auth, backup/restore, documents, all other pages

