

# Fix Estimate Version Assignment and Family Grouping

## Root cause

`handleFileUpload` and `handleDocumentSelect` in `Estimates.tsx` always call `createEstimate(filePath, fileName)` without a `parentId`, creating a new standalone active estimate every time. Only `handleReplaceUpload` correctly uses `replaceEstimate`.

## Changes — 3 items, all in `src/pages/Estimates.tsx`

### 1. Upload flow: ask "new or version?"

After a file is uploaded to storage (or a document is selected), but before creating the estimate record:

- If no existing estimate families exist: create standalone immediately (current behavior)
- If families exist: show a small dialog with two choices:
  - **"Neue eigenständige Schätzung"** → calls `createEstimate(path, name)` (standalone)
  - **"Neue Version von: [family name]"** (select from list) → calls `replaceEstimate(selectedEstimateId, path, name)`

Implementation: add a `pendingUpload: { filePath: string; fileName: string } | null` state. Set it after successful storage upload. Show a dialog when `pendingUpload` is set and families exist. On choice, call the appropriate function and clear `pendingUpload`.

Same logic applies to `handleDocumentSelect`.

### 2. Family grouping in accordion

Group `estimates` by family root (`parent_id || id`) before rendering:

```ts
const estimateFamilies = useMemo(() => {
  const seen = new Set<string>();
  return estimates.filter(est => {
    const rootId = est.parent_id || est.id;
    if (seen.has(rootId)) return false;
    seen.add(rootId);
    return true;
  }).map(est => ({
    rootId: est.parent_id || est.id,
    activeVersion: est,
    versions: getVersions(est.id),
  }));
}, [estimates, allEstimates]);
```

Render one accordion entry per family. Show version badge ("v2 von 3") when versions > 1.

### 3. Summary description

Change from `"{n} Schätzung(en)"` to `"{n} Schätzfamilie(n)"`. The actual numeric summary (`estimateItems` from hook = active-only items) is already correct and unchanged.

## Explicitly not included

- No post-hoc reassignment action — `replaceEstimate` is designed for new uploads, not reparenting existing records. Reassignment would need dedicated logic in a future phase.

## Files

| File | Change |
|------|--------|
| `src/pages/Estimates.tsx` | Pending-upload state + choice dialog, family grouping in accordion, summary text |

## Unchanged

- `useEstimates.ts` — hook logic and active filtering already correct
- Database schema — no migration
- `Comparison.tsx`, invoice logic, offer logic
- Auth, dashboard, backup/restore, all other pages

