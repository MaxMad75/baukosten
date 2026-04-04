

# Offer Comparison Layer — Implementation Plan (Refined)

## Offer Aggregation and Display Rules

1. **Union of selected offers only**: The Angebot column is computed from the union of offer items across all selected offers. No unselected offer data is included.
2. **No offers selected = inactive layer**:
   - Per-row offer values render as "–"
   - Offer total summary card is hidden
   - Detail panel offer section is hidden
3. **Sum per cost group**: When multiple selected offers contribute items to the same `kostengruppe_code`, their amounts are summed for that row.
4. **Soll and Ist unchanged**: Selecting or deselecting offers has zero effect on Soll values, Ist values, difference, or percentage columns.
5. **Purely additive column**: The Angebot column is display-only. It does not feed into the Soll/Ist difference or percentage calculations in this phase.

## Changes

### `src/hooks/useOffers.ts`

Add bulk item loading alongside existing per-offer loader:
- `allOfferItems: OfferItem[]` state, populated by `fetchAllOfferItems()` after `fetchOffers` completes
- Single query: `select * from offer_items where offer_id in (...offerIds)`
- Existing `fetchOfferItems(offerId)` and `saveOfferItems` remain unchanged

### `src/pages/Comparison.tsx`

Additive changes only:

1. **Import & hook**: `useOffers()` — consume `offers`, `allOfferItems`
2. **Selection state**: `selectedOfferIds: Set<string>`, default empty (inactive)
3. **Selector UI**: Below estimate version selector, a card "Angebote einbeziehen" with checkboxes per offer (`company_name — title`). Hidden when `offers.length === 0`.
4. **ComparisonRow extension**: Add `offerBrutto: number` and `offerItems: Array<{offer: Offer; amount: number; is_gross: boolean}>` fields
5. **comparisons useMemo**: Filter `allOfferItems` to selected offer IDs, aggregate per `kostengruppe_code` using `toBrutto()`. When `selectedOfferIds` is empty, all `offerBrutto` = 0, all `offerItems` = [].
6. **Table column**: "Angebot (brutto)" after Soll, before Ist. Renders value when offers selected, "–" otherwise.
7. **Total card**: Fourth summary card for Angebot total. Hidden when no offers selected.
8. **Detail panel**: Offer section showing per-offer breakdown (company + amount) for the selected cost group. Hidden when no offers selected.

## Files

| File | Change |
|------|--------|
| `src/hooks/useOffers.ts` | Add `allOfferItems` + `fetchAllOfferItems` |
| `src/pages/Comparison.tsx` | Offer selector, column, totals card, detail section |

## Unchanged

- Invoice payments, allocations, splits, status
- Estimate version selection logic and Soll computation
- Ist computation and difference/percentage columns
- `Offers.tsx` management page
- Database schema (no migration)
- Auth, dashboard, documents, backup/restore

