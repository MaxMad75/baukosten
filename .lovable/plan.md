

# Document-to-Offer Shortcut — Manual-First Plan

## Approach

Mirror the existing invoice badge/action pattern but keep offer creation strictly manual — triggered only by explicit user click on "Angebot strukturieren".

## Changes — `src/pages/Documents.tsx` only

### 1. Import `useOffers`
Consume `offers` and `createOffer` from the hook.

### 2. Badge for linked offers (line ~557-561 area)
After the existing `invoice_id` badge, add:
```
{offers.some(o => o.document_id === doc.id) && (
  <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700">
    Angebot
  </Badge>
)}
```

### 3. "Angebot strukturieren" action button (line ~580-609 area)
Add a new action button in the actions column, visible only when:
- `doc.document_type === 'Angebot'`
- No offer already linked (`!offers.some(o => o.document_id === doc.id)`)

On click: call `createOfferFromDocument(doc)` helper that:
- Extracts `company_name` from contractor or AI summary
- Sets `title` from `doc.title`
- Sets `document_id` to `doc.id`
- Sets `contractor_id` from `doc.contractor_id`
- Calls `createOffer(...)` and shows a success toast

### 4. Upload form hint banner (line ~423-436 area)
Add below the existing invoice hint:
```
{formData.document_type === 'Angebot' && (
  <div className="...yellow hint...">
    Angebot erkannt – kann nach dem Speichern als strukturiertes Angebot angelegt werden
  </div>
)}
```
Informational only — no auto-creation.

### 5. No changes to `handleCreate` or `handleAnalyzeDocument`
These functions remain untouched — no automatic offer creation.

## Files

| File | Change |
|------|--------|
| `src/pages/Documents.tsx` | Import useOffers, add badge, action button, hint banner, helper function |

## Unchanged
- `handleCreate` — no offer auto-creation
- `handleAnalyzeDocument` — no offer auto-creation
- `useOffers.ts`, `Offers.tsx`, `Comparison.tsx`
- Invoice logic, estimate versioning, payments, allocations
- Database schema (no migration)
- Auth, dashboard, backup/restore

