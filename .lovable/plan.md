
# Phase 1: Version-Centric Estimates — IMPLEMENTED

## What was done

1. **Database**: Created `estimate_versions` table with RLS, added `version_id` column to `architect_estimates`, migrated existing data
2. **Types**: Added `EstimateVersion` interface, added `version_id` to `ArchitectEstimate`
3. **Hook** (`useEstimates.ts`): Rewritten to be version-centric. `estimate_versions.is_active` is the source of truth. `setActiveVersion` syncs `architect_estimates.is_active` as side effect. Removed `replaceEstimate` / `getVersions` (legacy family logic). Added `versions`, `activeVersion`, `createVersion`, `updateVersionName`.
4. **Estimates page**: Version selector with tabs, inline renaming, "set as active" button. Uploads/manual entries are scoped to the displayed version. Summary shows displayed version totals.

## Phase 2 (future)

- `estimate_blocks` sub-grouping within a version
- "Copy manual blocks from previous version" flow
- Selective block copying when creating new versions
