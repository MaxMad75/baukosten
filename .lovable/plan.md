

# Persistent Manual Blocks with Redundancy Warning

## Data model changes

**Migration: add `carry_forward` column to `estimate_blocks`**

```sql
ALTER TABLE estimate_blocks
ADD COLUMN carry_forward boolean NOT NULL DEFAULT false;
```

Single boolean column. Only meaningful when `block_type = 'manual'`. No other schema changes needed.

The redundancy warning does not require a new column — it is computed at import time by comparing kostengruppe codes between the imported block's items and existing carried-forward manual blocks in the same version.

## Version creation flow

Current flow (lines 646-671 of Estimates.tsx):
1. `createVersion()` is called
2. Previous version's manual blocks are listed
3. A dialog opens where user selects which blocks to copy
4. `copyBlocksToVersion()` copies selected blocks

**Change**: Instead of listing all manual blocks for selection, auto-select blocks where `carry_forward = true` (pre-checked, non-removable from the copy list unless user explicitly unchecks). Other manual blocks remain opt-in as today.

In `copyBlocksToVersion` (useEstimates.ts line 350): copied blocks inherit the `carry_forward` flag from their source.

No changes to `createVersion()` itself.

## Redundancy warning logic

**When**: After a PDF import completes and items are saved to a new imported block (in `handleAnalysisResult` / `handleConfirmImport`).

**How**: Deterministic comparison by DIN 276 kostengruppe code at the 3-digit parent level.

```text
For each item in the new imported block:
  Extract parent code (first 3 digits of kostengruppe_code)
For each carry_forward manual block in the same version:
  Collect parent codes from its items
If intersection is non-empty:
  Show warning: "Block X covers similar cost groups as manual block Y"
```

No AI matching. No auto-deletion. Warning is informational only — user dismisses it.

## UI changes in Estimates.tsx

1. **Block header**: Add a small toggle/icon next to each manual block's label showing carry-forward status. A pin icon (e.g. `Pin` from lucide) when `carry_forward = true`. Clicking toggles the flag via a new `updateBlock` function.

2. **Version creation dialog**: Pre-check carry-forward blocks and show them with a pin badge. User can still uncheck them.

3. **After import**: If redundancy is detected, show an `Alert` component below the imported block listing the overlapping manual blocks and shared cost group ranges. Dismiss-only, no auto-action.

## Files to change

| File | Change |
|------|--------|
| Migration SQL | Add `carry_forward` boolean to `estimate_blocks` |
| `src/lib/types.ts` | Add `carry_forward: boolean` to `EstimateBlock` |
| `src/hooks/useEstimates.ts` | Add `updateBlock(blockId, updates)` function. Update `copyBlocksToVersion` to preserve `carry_forward`. |
| `src/pages/Estimates.tsx` | Toggle UI on block header. Pre-select carry-forward blocks in copy dialog. Redundancy warning after import. |
| `src/utils/backup/types.ts` | Add `carry_forward` to `BackupEstimateBlock` |
| `src/utils/backup/export.ts` | Include `carry_forward` in export |
| `src/utils/backup/import.ts` | Map `carry_forward` on import (default `false` for old backups) |

## Unchanged

- `estimate_versions`, `architect_estimates`, `architect_estimate_items` tables
- Comparison, Dashboard, Invoices, Offers pages
- Invoice/offer tax handling
- Edge functions
- Auth, contractors, construction journal, documents
- `deleteBlock`, `deleteVersion` logic (deferred)

