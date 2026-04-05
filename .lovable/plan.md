

# Document-to-Offer Workflow Improvement — Refined Plan

## Prefill rule (refined)

`createOfferFromDocument` will use only already-available structured fields:
- `company_name` — from contractor lookup or `doc.title` (existing logic)
- `title` — from `doc.title` (existing)
- `document_id` — from `doc.id` (existing)
- `contractor_id` — from `doc.contractor_id` (existing)
- `offer_date` — **left empty**. The `AiResult` interface has `invoice_date` but no `offer_date` field, and `invoice_date` is semantically incorrect for an offer. No ad hoc `ai_summary` parsing will be added.

No regex/heuristic parsing of `ai_summary`. No new date extraction utilities.

## Changes

### 1. `src/pages/Documents.tsx`

**a) Navigation after creation**: Import `useNavigate`. After `createOffer` returns successfully with a result ID, call `navigate('/offers?edit=' + result.id)`.

**b) Prefill stays as-is** — only structured fields used, `offer_date` left empty.

### 2. `src/pages/Offers.tsx`

**a) URL param support**: Import `useSearchParams`. On mount, if `?edit=<offerId>` is present and matches a loaded offer, auto-open the edit dialog for that offer and clear the param.

## Files

| File | Change |
|------|--------|
| `src/pages/Documents.tsx` | Add `useNavigate`, navigate to `/offers?edit=id` after creation |
| `src/pages/Offers.tsx` | Read `?edit=` param, auto-open edit dialog |

## Unchanged

- `useOffers.ts` — no changes
- `Comparison.tsx` — no changes
- Invoice logic, estimate logic, backup/restore
- Auth, dashboard, contractors
- Database schema (no migration)
- Offer item editor (existing flow remains)

