

# Invoice Stabilization Plan (Refined)

## Legacy Field Consolidation Rule

**Principle**: `invoice_payments` + derived `status` are the sole authority for payment state. Legacy fields (`is_paid`, `paid_by_profile_id`, `payment_date`) are only synchronized in one central place: `recalculateInvoiceStatus` in `useInvoicePayments.ts`. No other code path may write these fields independently.

## Changes

### `src/hooks/useInvoices.ts`
1. **Remove `markAsPaid`** — dead code that bypasses the payment model
2. **Remove `is_paid` from `createInvoice`** — new invoices start as `status: 'draft'` with no payments; `is_paid` defaults to `false` in the DB and is only ever set by `recalculateInvoiceStatus`

### `src/hooks/useInvoicePayments.ts`
3. **`recalculateInvoiceStatus` becomes the single sync point** for all legacy fields:
   - Already syncs `is_paid` and `payment_date` — add `paid_by_profile_id` sync here too (set to the most recent payment's `profile_id` when paid, `null` when not)
   - When `totalPaid` drops to 0, set status to `'approved'` instead of falling through to `'draft'`

### `src/pages/Invoices.tsx`
4. **`handleRecordPayment`** (lines 225, 231): Remove the `updateInvoice({ paid_by_profile_id: ... })` calls — `recalculateInvoiceStatus` now handles this centrally
5. **`handleResetPayments`** (line 242): Remove the manual `updateInvoice({ is_paid: false, paid_by_profile_id: null, payment_date: null, status: 'draft' })` — `deleteAllPayments` already calls `recalculateInvoiceStatus` which will set all these fields correctly (status → `approved`)
6. **Restrict status dropdown**: Disable `paid` and `partially_paid` options in the edit dialog — these are payment-derived, not manually settable
7. **Enforce cost group**: Require at least one cost group before saving in `handleUpdateInvoice`
8. **Fix allocation editor grid**: Consistent column layout regardless of estimate item presence

### Unchanged
- `useInvoicePayments` structure, `Comparison.tsx`, backup/restore, invoice splits, all other pages

## Files

| File | Change |
|------|--------|
| `src/hooks/useInvoices.ts` | Remove `markAsPaid`, remove `is_paid` from create |
| `src/hooks/useInvoicePayments.ts` | Centralize all legacy field sync in `recalculateInvoiceStatus`; fix fallback to `approved` |
| `src/pages/Invoices.tsx` | Remove ad-hoc legacy writes from handlers; restrict status dropdown; enforce KG; fix grid |

