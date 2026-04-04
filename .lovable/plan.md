

# Invoice Domain Model Improvement

## Problem
The current invoice model uses simplistic booleans (`is_paid`, `paid_by_profile_id`) for payment tracking, has no formal status workflow, and no support for partial payments. The payer split (who bears the cost internally) is conflated with actual payment events.

## Current State
- **invoices** table: `is_paid` boolean, `paid_by_profile_id`, `payment_date` — flat, single-payment model
- **invoice_splits** table: cost distribution per household member (already exists, works)
- **documents** table: linked via `invoice_id` (already exists)
- UI: binary paid/unpaid toggle, single payer select or multi-split

## Plan

### Step 0: Fix Estimates.tsx TS1128 build error
Re-write the last few lines of `src/pages/Estimates.tsx` to eliminate any invisible/corrupt characters causing the TS1128 error at line 1298.

### Step 1: Database migration — add `invoice_status` and `invoice_payments` table

**Add status column to invoices:**
```text
ALTER TABLE invoices ADD COLUMN status text NOT NULL DEFAULT 'draft';
-- Migrate existing data:
-- is_paid = true  → status = 'paid'
-- is_paid = false → status = 'draft'
```

Valid statuses: `draft`, `review_needed`, `approved`, `partially_paid`, `paid`, `cancelled`

**Add `net_amount` and `tax_amount` columns:**
```text
ALTER TABLE invoices ADD COLUMN net_amount numeric NULL;
ALTER TABLE invoices ADD COLUMN tax_amount numeric NULL;
```
These are optional — `amount` remains the primary field (gross or net based on `is_gross`). When provided, validation ensures `net_amount + tax_amount ≈ gross amount` (within 0.02 tolerance).

**New table `invoice_payments`:**
```text
invoice_payments
  id             uuid PK DEFAULT gen_random_uuid()
  invoice_id     uuid NOT NULL FK → invoices(id) ON DELETE CASCADE
  profile_id     uuid NOT NULL FK → profiles(id)
  amount         numeric NOT NULL
  payment_date   date NOT NULL
  notes          text NULL
  created_at     timestamptz DEFAULT now()
```
RLS: same pattern as invoice_splits (JOIN on invoices.household_id).

**Data migration for existing paid invoices:**
- For each invoice where `is_paid = true`: insert one row into `invoice_payments` with `profile_id = paid_by_profile_id`, `amount = invoices.amount`, `payment_date = invoices.payment_date`.

The old columns (`is_paid`, `paid_by_profile_id`, `payment_date`) remain for backward compatibility but become secondary — status is now the source of truth.

### Step 2: Type updates (`src/lib/types.ts`)

```text
+ InvoiceStatus = 'draft' | 'review_needed' | 'approved' | 'partially_paid' | 'paid' | 'cancelled'

  Invoice: add status, net_amount, tax_amount fields

+ InvoicePayment { id, invoice_id, profile_id, amount, payment_date, notes, created_at }
```

### Step 3: New hook `src/hooks/useInvoicePayments.ts`

- `fetchPaymentsForInvoice(invoiceId)` — loads payments for one invoice
- `fetchAllPayments()` — loads all payments for household (for aggregations)
- `addPayment(invoiceId, profileId, amount, date, notes?)` — inserts payment + auto-updates invoice status
- `deletePayment(paymentId)` — removes payment + recalculates status
- `deriveStatus(invoice, payments)` — helper: if total payments >= invoice amount → 'paid', if > 0 → 'partially_paid', else keep current status

### Step 4: Validation utilities (`src/utils/invoiceValidation.ts`)

- `validateNetTaxGross(net, tax, gross, tolerance = 0.02)` — returns boolean
- `validateSplitsSum(splits, invoiceAmount, tolerance = 0.01)` — returns boolean (already exists inline, extract to shared util)

### Step 5: Minimal UI changes in `src/pages/Invoices.tsx`

- **Status column**: Replace binary paid/unpaid with a Badge showing the status (color-coded)
- **Pay dialog**: Instead of toggling `is_paid`, insert a payment record via `useInvoicePayments.addPayment()`. Allow partial amount entry. Status auto-derives.
- **Statistics cards**: Derive paid/open amounts from `status` field instead of `is_paid` boolean
- **"Mark as unpaid"**: Delete all payments for the invoice, reset status to previous state (approved or draft)
- Keep all existing UI structure, dialogs, table layout, pie chart logic intact

### Step 6: Update dependent modules

- **`src/hooks/useInvoices.ts`**: `markAsPaid` delegates to payment creation instead of setting `is_paid`. `fetchInvoices` includes `status` in returned data.
- **`src/pages/Comparison.tsx`**: No changes needed — uses `invoices` array which still has `amount` and `kostengruppe_code`.
- **`src/utils/excelExport.ts`**: Add payment status column to invoices sheet. No structural changes.
- **`src/utils/backup/export.ts` and `import.ts`**: Add `invoice_payments` to backup/restore cycle.

### What stays unchanged
- Invoice splits (cost distribution) — already clean, stays on invoice level
- Document-to-invoice linking — already works via `invoice_id`
- Estimate versioning, contractors, construction journal, auth — untouched
- Dashboard, comparison page structure — untouched

---

## Files changed

| File | Change |
|------|--------|
| DB migration | New table `invoice_payments`, add `status`/`net_amount`/`tax_amount` to invoices, migrate existing paid data |
| `src/lib/types.ts` | Add `InvoiceStatus`, `InvoicePayment`, extend `Invoice` |
| `src/hooks/useInvoicePayments.ts` | New hook for payment CRUD + status derivation |
| `src/utils/invoiceValidation.ts` | New shared validation utilities |
| `src/hooks/useInvoices.ts` | Adapt `markAsPaid` to use payments, include `status` |
| `src/pages/Invoices.tsx` | Status badge, partial payment in pay dialog |
| `src/utils/excelExport.ts` | Add status column |
| `src/utils/backup/export.ts` | Include `invoice_payments` |
| `src/utils/backup/import.ts` | Restore `invoice_payments` |
| `src/pages/Estimates.tsx` | Fix TS1128 (re-write closing lines) |

