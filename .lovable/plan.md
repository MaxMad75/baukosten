

# Phase 2: Estimate Blocks (Revised)

## Adjustments from original Phase 2 plan

1. **Backup/restore included**: Export and import of `estimate_blocks` and `block_id` linkage on items. Minimal additions to existing backup types and flows -- no full redesign.
2. **`deleteVersion` removed**: Too risky with mixed legacy/block data. Deferred to a later phase.

## Database migration

**New table `estimate_blocks`:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `version_id` | uuid NOT NULL | FK to `estimate_versions.id` |
| `block_type` | text NOT NULL | `'imported'` or `'manual'` |
| `label` | text NOT NULL | e.g. "Architekt KS", "Grundstück" |
| `file_path` | text | Imported blocks only |
| `file_name` | text | Imported blocks only |
| `source_block_id` | uuid | Set when copied from prior version |
| `processed` | boolean DEFAULT false | Imported blocks only |
| `notes` | text | |
| `sort_order` | integer DEFAULT 0 | |
| `created_at` | timestamptz DEFAULT now() | |

RLS: join through `estimate_versions` to `household_id = get_user_household_id()`.

**Alter `architect_estimate_items`:**
- Add `block_id uuid` (nullable). Legacy items keep `block_id = NULL` and continue to work via `estimate_id`.

## Types: `src/lib/types.ts`

Add `EstimateBlock` interface.

## Hook: `src/hooks/useEstimates.ts`

- Fetch `estimate_blocks` for all versions
- New functions: `createBlock`, `addBlockItems`, `deleteBlock`, `copyBlocksToVersion`
- **No `deleteVersion`** in this phase
- `estimateItems` / `getAllEstimatedAmounts` returns items from active version: block-linked items (via `block_id` on blocks belonging to active version) plus legacy items (via `estimate_id` on `architect_estimates` with matching `version_id`)

## UI: `src/pages/Estimates.tsx`

- Within selected version: show blocks as accordion sections
- "Add block" button: choose imported (PDF upload) or manual
- Delete block with confirmation
- "New version" flow: create version row, then show checklist of manual blocks from previous version to copy
- No version deletion button

## Backup/restore additions

### Backup types (`src/utils/backup/types.ts`)

Bump `BACKUP_SCHEMA_VERSION` to `'1.1.0'`. Add:

```ts
export interface BackupEstimateBlock {
  id: string;
  version_id: string;
  block_type: string;
  label: string;
  file_path: string | null;
  file_name: string | null;
  source_block_id: string | null;
  processed: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
}
```

Add `estimateBlocks: BackupEstimateBlock[]` to `BackupData.data` and `estimateBlocks: number` to `BackupManifest.counts`.

Add `block_id: string | null` to `BackupEstimateItem`.

### Export (`src/utils/backup/export.ts`)

After fetching estimates, also fetch `estimate_blocks` for the household's version IDs. Include in `backupData.data.estimateBlocks`. Include `block_id` when exporting estimate items.

### Import (`src/utils/backup/import.ts`)

After restoring estimate versions (if present), restore blocks with ID mapping. When restoring estimate items, map `block_id` through the block ID map (nullable -- old backups won't have it).

### Re-export (`src/utils/backup/index.ts`)

No structural change needed -- types are already re-exported.

## Files to change

| File | Change |
|------|--------|
| Migration SQL | Create `estimate_blocks`, add `block_id` to `architect_estimate_items`, RLS |
| `src/lib/types.ts` | Add `EstimateBlock` |
| `src/hooks/useEstimates.ts` | Block CRUD, copy-blocks-to-version, item retrieval with dual path |
| `src/pages/Estimates.tsx` | Block-grouped accordion, add/delete block, new-version-with-copy |
| `src/utils/backup/types.ts` | Bump schema version, add `BackupEstimateBlock`, extend item type |
| `src/utils/backup/export.ts` | Fetch and export blocks and `block_id` on items |
| `src/utils/backup/import.ts` | Restore blocks with ID mapping, map `block_id` on items |

## Unchanged

- `estimate_versions` table -- no schema change
- `architect_estimates` table -- no changes
- `Comparison.tsx`, Dashboard -- same hook contract
- Invoice, offer, allocation logic
- Edge functions
- Auth, contractors, construction journal, documents

## Explicitly deferred

- **`deleteVersion`**: removed from this phase; requires explicit legacy-cleanup rules first
- **Legacy data migration**: existing `architect_estimates` not auto-converted to blocks
- **Block reordering UI**: `sort_order` column present but no drag-and-drop

