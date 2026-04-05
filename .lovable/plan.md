

# Auto-Open Item Editor After Document-Based Offer Creation

## Current state

1. `createOfferFromDocument` in Documents.tsx creates the offer, then navigates to `/offers?edit=<id>`
2. Offers.tsx reads `?edit=<id>`, calls `openEdit(match)` which opens the **metadata edit dialog**
3. The **item editor** is a separate dialog opened by `openItemEditor(offerId)` which sets `editingItemsOfferId`
4. Both dialogs are independent — only one should be open at a time

## Problem

After document-based creation, the metadata is already prefilled and usually correct. The user's real next step is adding cost group items — but they land in the metadata editor instead.

## Proposed change

Use a different URL parameter `?items=<offerId>` to signal that the item editor should open instead of the metadata editor.

### 1. `src/pages/Documents.tsx`

Change the navigation target from:
```
navigate('/offers?edit=' + result.id)
```
to:
```
navigate('/offers?items=' + result.id)
```

### 2. `src/pages/Offers.tsx`

Add a second branch in the existing `useEffect` to handle `?items=<id>`:

```ts
useEffect(() => {
  const editId = searchParams.get('edit');
  const itemsId = searchParams.get('items');
  if (editId && offers.length > 0) {
    const match = offers.find(o => o.id === editId);
    if (match) {
      openEdit(match);
      setSearchParams({}, { replace: true });
    }
  } else if (itemsId && offers.length > 0) {
    const match = offers.find(o => o.id === itemsId);
    if (match) {
      openItemEditor(match.id);
      setSearchParams({}, { replace: true });
    }
  }
}, [searchParams, offers]);
```

No conflict between `edit` and `items` — they are mutually exclusive params. Existing `?edit=` behavior is fully preserved for any other caller.

## Files

| File | Change |
|------|--------|
| `src/pages/Documents.tsx` | Change nav target from `?edit=` to `?items=` |
| `src/pages/Offers.tsx` | Add `?items=` branch in existing useEffect |

## Unchanged

- `useOffers.ts`, `Comparison.tsx`, invoice/estimate logic
- Metadata edit dialog behavior (still works via `?edit=`)
- Item editor dialog internals
- Auth, dashboard, backup/restore, all other pages
- Database schema

