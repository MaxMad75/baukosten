

# Stabilization Plan: Mixed Legacy vs Block Data

## Analysis Summary

The current dual-path logic in both `useEstimates.ts` and `Estimates.tsx` is **already correctly guarding against double counting**. The key filter rule at lines 251-253 of Estimates.tsx (and lines 28-31 of useEstimates.ts) uses:

- `i.block_id && blockIds.has(i.block_id)` — block path
- `!i.block_id && estIds.has(i.estimate_id)` — legacy path (only items WITHOUT block_id)

This means items with `block_id` are never counted via the legacy path. No double counting occurs in summaries.

### What IS working correctly

1. **Summary totals** (`displayedItems`, `getAllEstimatedAmounts`): No double counting — the `!i.block_id` guard prevents it.
2. **Legacy rendering**: `legacyEstimatesWithItems` only shows estimates that have items with `block_id = NULL`. Empty legacy container records (created alongside imported blocks) are excluded.
3. **New imports**: Items created via `addBlockItems` get both `estimate_id` (required by NOT NULL FK) and `block_id`, so they only appear under the block.

### What is NOT a real bug but is unnecessary complexity

1. **Redundant legacy `architect_estimates` container**: Every PDF import (line 397) creates both a block AND a legacy estimate record. The legacy record is required because `architect_estimate_items.estimate_id` is NOT NULL — items need a valid FK target. The legacy record itself has no `!block_id` items, so it never renders. But it clutters the data.

### Actual risks remaining

1. **Manual block item creation** (lines ~540-570 in `handleAddManualItem`): Need to verify whether manual items added to a block also correctly set `block_id`. If they don't, they'd show under both the block (no) and the legacy estimate (yes).

2. **Edge case**: If a user added items to a legacy estimate in Phase 1, then in Phase 2 those items have `block_id = NULL` and show correctly in the legacy accordion. No duplication risk unless someone manually creates a block for the same content.

## Verdict: No stabilization migration needed

The code is already safe. The dual-path filter logic is correct and there are no double-counting bugs in the current implementation.

## One small code fix recommended

Verify and fix the manual "add item to block" flow to ensure `block_id` is always set when adding items to a block. This is the only path where a bug could cause items to appear in both views.

### File to check/fix

| File | Change |
|------|--------|
| `src/pages/Estimates.tsx` | Verify `handleAddManualItem` sets `block_id` when adding to a block. If it uses `addBlockItems`, it's already correct. If it uses `addEstimateItems`, items won't get `block_id` and will appear in the legacy accordion instead of the block. |

### Unchanged

- `useEstimates.ts` — dual-path logic is correct
- Migration / schema — no changes needed
- Comparison, Dashboard, invoices, offers, backup
- All other pages and hooks

## Explicitly deferred

- **Removing the redundant legacy `architect_estimates` container creation**: Requires making `architect_estimate_items.estimate_id` nullable or introducing a household-level dummy record. Not worth the risk now.
- **Legacy data migration to blocks**: Deferred as planned.

