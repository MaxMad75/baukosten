

# Estimate Version Comparison — Stabilization Plan

## Findings

### 1. Comparison.tsx JSX — Structurally sound
The JSX is clean. Version selector, comparison table, and detail panel all render correctly. No broken fragments or mismatched elements.

### 2. Version selector state — Correct
- `selectedVersions` is initialized per family via `useEffect` on `families`, defaulting to `is_active` version.
- Previous selections are preserved if the version still exists; otherwise falls back to active or latest.
- One version per family is enforced by the `Record<string, string>` structure.
- No issues found.

### 3. Soll values — Exclusively from selected versions
- `selectedEstimateItems` derives from `getItemsByEstimateIds(Object.values(selectedVersions))` — correct.
- `comparisons` useMemo uses only `selectedEstimateItems` — no mixing with `activeEstimateItems`.
- Totals derive from `comparisons` — clean.
- No issues found.

### 4. Actual values — Unchanged
- Uses `getEffectiveAllocations(inv)` from the allocations hook — correct and untouched.

### 5. Detail panel — Legacy `is_paid` usage (BUG)
**Line 304**: `{inv.is_paid && <Badge variant="secondary" className="text-xs">bezahlt</Badge>}`

This uses the legacy `is_paid` boolean instead of the current `status` field. Should use `inv.status === 'paid'` (or include `'partially_paid'`).

### 6. useEstimates.ts — Both helpers present and correct
- `getItemsByEstimate(estimateId)` — line 234, filters `estimateItems` (all items).
- `getItemsByEstimateIds(ids)` — line 238, filters `estimateItems` (all items).
- Both operate on the full item set, which is correct for version comparison.

## Stabilization Change

### `src/pages/Comparison.tsx`
- **Line 304**: Replace `inv.is_paid` with `inv.status === 'paid' || inv.status === 'partially_paid'`, and show the appropriate label (`bezahlt` / `teilweise bezahlt`).

That is the only issue found. Everything else is structurally sound.

| File | Change |
|------|--------|
| `src/pages/Comparison.tsx` | Replace legacy `is_paid` with status-based badge in detail panel |

## Unchanged
- `useEstimates.ts` (clean)
- Version selector logic (correct)
- Soll/Ist computation (correct)
- All other files

