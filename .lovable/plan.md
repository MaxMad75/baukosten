

# Offer Domain — Phase 1: Structured Entity + Management UI

## Database Migration

Two new tables following existing patterns (household-scoped, RLS via `get_user_household_id()`):

### `offers`
```sql
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  document_id uuid,
  contractor_id uuid,
  company_name text not null,
  title text not null,
  offer_date date,
  total_amount numeric not null default 0,
  is_gross boolean not null default true,
  notes text,
  created_by_profile_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.offers enable row level security;
-- Standard 4-policy CRUD on household_id = get_user_household_id()
-- updated_at trigger using update_updated_at_column()
```

### `offer_items`
```sql
create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  kostengruppe_code text not null,
  amount numeric not null default 0,
  description text,
  is_gross boolean not null default true,
  created_at timestamptz default now()
);
alter table public.offer_items enable row level security;
-- RLS via join to offers → household_id = get_user_household_id() (same pattern as invoice_allocations)
```

## Code Changes

### `src/lib/types.ts`
Add `Offer` and `OfferItem` interfaces matching the table columns.

### `src/hooks/useOffers.ts`
New hook following the `useContractors` pattern:
- `fetchOffers()`, `createOffer()`, `updateOffer()`, `deleteOffer()`
- `fetchOfferItems(offerId)`, `saveOfferItems(offerId, items[])`
- Recalculate `total_amount` on the offer whenever items are saved

### `src/pages/Offers.tsx`
Minimal management page following the Contractors page pattern:
- List of offers (company, title, date, total, item count)
- Create/edit dialog: company name, title, offer date, contractor selector (from `useContractors`), notes
- Offer item editor: rows of cost group (KostengruppenSelect) + amount + description, add/remove rows
- Delete with confirmation
- Search/filter bar

### `src/components/Layout.tsx`
Add nav entry `{ to: '/offers', icon: FileText, label: 'Angebote' }` between Kostenschätzung and Soll/Ist.

### `src/App.tsx`
Add route: `<Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />`

## Files

| File | Change |
|------|--------|
| New migration | Create `offers` + `offer_items` tables with RLS + trigger |
| `src/lib/types.ts` | Add `Offer`, `OfferItem` |
| `src/hooks/useOffers.ts` | New hook |
| `src/pages/Offers.tsx` | New page |
| `src/components/Layout.tsx` | Add nav entry |
| `src/App.tsx` | Add route |

## Unchanged
- `Comparison.tsx` — no offer column yet
- `Documents.tsx` — no shortcut yet
- Invoice payments, allocations, splits, status
- Estimate versioning
- Auth, dashboard, backup/restore, settings

