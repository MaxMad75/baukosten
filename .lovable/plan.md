

# Phase 1: Version-Centric Estimates (Refined Active-Version Rule)

## Goal

Introduce `estimate_versions` table as the primary version layer. Make the Estimates page version-centric. Establish a single source of truth for "active version."

## Active-version rule (refined)

1. `estimate_versions.is_active` is the sole source of truth. Exactly one row per household is active.
2. `architect_estimates.is_active` is kept for backward compatibility but is **never read as authoritative**. It is only synchronized as a side effect.
3. `setActiveVersion(versionId)` does:
   - `UPDATE estimate_versions SET is_active = false WHERE household_id = ?`
   - `UPDATE estimate_versions SET is_active = true WHERE id = versionId`
   - Then sync: `UPDATE architect_estimates SET is_active = (version_id = versionId) WHERE version_id IN (SELECT id FROM estimate_versions WHERE household_id = ?)`
4. The hook's `estimates` / `estimateItems` / `getAllEstimatedAmounts` filter by joining through `estimate_versions.is_active`, not by reading `architect_estimates.is_active`.
5. The Estimates page and version selector read `estimate_versions.is_active` only.

## Database migration

**New table `estimate_versions`:**
- `id uuid PK DEFAULT gen_random_uuid()`
- `household_id uuid NOT NULL`
- `version_number integer NOT NULL DEFAULT 1`
- `name text NOT NULL` (e.g. "V1", "V2 nach Umplanung")
- `is_active boolean NOT NULL DEFAULT true`
- `notes text`
- `created_at timestamptz DEFAULT now()`
- RLS: `household_id = get_user_household_id()` for all operations

**Alter `architect_estimates`:**
- Add `version_id uuid` (nullable)

**Data migration (same SQL file):**
- For each household, group existing `architect_estimates` by family root (`COALESCE(parent_id, id)`)
- For each family, create one `estimate_versions` row per distinct version_number
- Set the version's `is_active` based on whether any estimate in that group has `is_active = true`
- Set `architect_estimates.version_id` to the corresponding version row
- Standalone estimates get their own single version row

## Files to change

| File | Change |
|------|--------|
| Migration SQL | Create `estimate_versions`, add `version_id` to `architect_estimates`, migrate data, RLS policies |
| `src/lib/types.ts` | Add `EstimateVersion` interface |
| `src/hooks/useEstimates.ts` | Fetch versions. Filter active estimates by joining through `estimate_versions.is_active` (not `architect_estimates.is_active`). Expose `versions`, `activeVersion`, `setActiveVersion`, `createVersion`, `updateVersionName`. `setActiveVersion` activates one version row, deactivates others, then syncs `architect_estimates.is_active`. `createEstimate` accepts optional `versionId`. |
| `src/pages/Estimates.tsx` | Version selector at top. Upload/add creates estimates under selected version. Summary shows active version totals. "Set as active" button on non-active versions. Remove or simplify the pending-upload-choice dialog (user is already within a version context). |

## Unchanged

- `architect_estimate_items` — no schema change
- `Comparison.tsx` — consumes `estimateItems` and `getAllEstimatedAmounts()` from hook (same contract, now backed by version-level filtering)
- Dashboard — same hook API
- Invoice, offer, allocation logic
- Backup/restore — not changed this phase (`version_id` is nullable, old backups still import)
- Edge functions, auth, contractors, construction journal, documents
- `tradeMapping.ts`

