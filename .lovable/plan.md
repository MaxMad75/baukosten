

# Stabilization Plan: Estimate Versions

## Root cause analysis

The migration has two bugs:

### Bug 1: All versions named "V1"
The migration groups by `(household_id, COALESCE(parent_id, id), version_number)`. Since all existing `architect_estimates` rows have `version_number = 1` (the column default), every generated `estimate_versions` row gets `version_number = 1` and `name = 'V1'`.

### Bug 2: Multiple active versions
Each family group independently sets `is_active = bool_or(ae.is_active)`. If two families each had an active estimate, two separate `estimate_versions` rows get `is_active = true`. The constraint "exactly one active per household" is violated at the data level.

### UI is correct
The UI at line 1084 renders `{v.is_active && <Badge>aktiv</Badge>}` — this correctly reads `v.is_active`. The problem is the data, not the rendering.

### Hook is correct
`useEstimates.ts` line 16: `versions.find(v => v.is_active)` returns the *first* active version. When multiple are active, it silently picks one, but the badge still shows on all of them in the UI.

## Fix: one corrective data migration

A single SQL migration that:

1. **Renumbers versions** sequentially per household (ordered by `created_at`), so they become 1, 2, 3...
2. **Sets distinct names**: `'V' || new_number` for any version still named `'V' || old_number` (preserves custom names)
3. **Enforces single active**: For each household, keeps only the version with the highest `version_number` as active, deactivates all others
4. **Syncs `architect_estimates.is_active`** to match the surviving active version

No code changes needed — the hook and UI already handle the data correctly once the data is correct.

## Files

| File | Change |
|------|--------|
| New migration SQL | Corrective data fix: renumber, rename, enforce single active |

## Unchanged

- `useEstimates.ts` — already correct
- `Estimates.tsx` — already correct
- All other files

