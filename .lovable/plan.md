

# Invoice-to-Estimate Allocation Plan (Refined)

## What this does

Adds a new `invoice_allocations` table so invoices can be distributed across multiple cost groups and/or multiple estimate line items within the same cost group. Includes validation, a read-only summary in the invoice list, and an editor in the edit dialog.

## Database

**New table: `invoice_allocations`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| invoice_id | uuid NOT NULL | FK to invoices |
| kostengruppe_code | text NOT NULL | DIN 276 code |
| estimate_item_id | uuid NULL | FK to architect_estimate_items (optional) |
| amount | numeric NOT NULL | Allocated portion |
| notes | text NULL | |
| created_at | timestamptz | DEFAULT now() |

RLS: same JOIN-through-invoices pattern as invoice_splits/invoice_payments.

**Migration seed:** For every invoice with `kostengruppe_code` set, insert one allocation row with the full amount.

## Key rules

1. **Multiple rows per cost group allowed** — two allocation rows can have the same `kostengruppe_code` but different `estimate_item_id` values (e.g. two different estimate positions within KG 300).

2. **Consistency constraint (app-level):** If `estimate_item_id` is set, the referenced `architect_estimate_items` row must have the same `kostengruppe_code` as the allocation row. Enforced in the hook's save logic and in UI filtering (KostengruppenSelect filters estimate items to matching code).

3. **No double-counting rule:** If `invoice_allocations` rows exist for an invoice, those are the sole source of cost group distribution. The legacy `invoices.kostengruppe_code` is only used as fallback when zero allocation rows exist. This rule applies in Comparison.tsx, useInvoiceAllocations, and any aggregation logic.

4. **Allocation sum validation:** Sum of all allocation amounts for one invoice must equal `invoice.amount` (tolerance 0.01).

## New hook: `src/hooks/useInvoiceAllocations.ts`

- `fetchAllocationsForInvoice(invoiceId)`
- `saveAllocations(invoiceId, allocations[])` — deletes old rows, inserts new; validates sum and kostengruppe-estimate consistency before saving
- `getEffectiveAllocations(invoice)` — returns real allocations if any exist, else synthesizes one from legacy `kostengruppe_code`
- `fetchAllAllocations()` — for Comparison page aggregation

## New type in `src/lib/types.ts`

```typescript
export interface InvoiceAllocation {
  id: string;
  invoice_id: string;
  kostengruppe_code: string;
  estimate_item_id: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
}
```

## UI changes

### Invoice list (read-only summary)
Each invoice row gets a small allocation indicator:
- **Single KG**: shows the code as today (e.g. "KG 300")
- **Multiple allocations**: shows e.g. "3 Zuordnungen" with a tooltip listing the cost groups and amounts
- **Has estimate links**: small icon/badge indicating concrete estimate item references exist

This is visible without opening any dialog.

### Invoice edit dialog (editor)
- Default: single cost group selector (current behavior, auto-creates one allocation on save)
- Toggle "Aufteilen auf mehrere Positionen" reveals a multi-row editor
- Each row: KostengruppenSelect + optional estimate item dropdown (filtered to items matching selected KG) + amount
- Validation: total must match invoice amount
- No new page or separate dialog

### Comparison page
- Replace grouping logic: use `getEffectiveAllocations` per invoice instead of reading `invoice.kostengruppe_code` directly
- Distributed amounts appear correctly per cost group

## Files changed

| File | Change |
|------|--------|
| DB migration | New `invoice_allocations` table + RLS + seed from existing data |
| `src/lib/types.ts` | Add `InvoiceAllocation` |
| `src/hooks/useInvoiceAllocations.ts` | New hook with CRUD, validation, consistency check, fallback logic |
| `src/pages/Invoices.tsx` | Allocation summary column + editor in edit dialog |
| `src/pages/Comparison.tsx` | Use allocations for cost group aggregation |
| `src/utils/backup/export.ts` | Include `invoice_allocations` |
| `src/utils/backup/import.ts` | Restore `invoice_allocations` |
| `src/utils/backup/types.ts` | Add `BackupInvoiceAllocation` |

## Unchanged

- Invoice payments, payer splits, status model
- Estimate versioning
- Document handling
- Auth, dashboard, contractors, construction journal
- `invoices.kostengruppe_code` column (kept as legacy fallback, not removed)
- No estimate version comparison

