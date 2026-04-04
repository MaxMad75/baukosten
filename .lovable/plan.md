

# Offer-vs-Estimate Delta — Implementation Plan (Refined)

## Single file: `src/pages/Comparison.tsx`

### 1. Extend `ComparisonRow` interface
Add `offerVsEstimate: number` — computed as `offerBrutto - estimatedBrutto`. Only meaningful when offers are active.

### 2. Compute in `comparisons` memo (line ~161)
After existing fields, add:
```
offerVsEstimate: offersActive ? (offerBrutto - estimatedBrutto) : 0
```

### 3. Totals memo — direct reduction from `comparisons`
Compute all totals by reducing over `comparisons` rows. No self-referencing:
```ts
const totals = useMemo(() => {
  const estimated = comparisons.reduce((s, r) => s + r.estimatedBrutto, 0);
  const actual = comparisons.reduce((s, r) => s + r.actualBrutto, 0);
  const difference = comparisons.reduce((s, r) => s + r.difference, 0);
  const offer = comparisons.reduce((s, r) => s + r.offerBrutto, 0);
  const offerVsEstimate = comparisons.reduce((s, r) => s + r.offerVsEstimate, 0);
  return { estimated, actual, difference, offer, offerVsEstimate };
}, [comparisons]);
```

### 4. Summary card
When `offersActive`, add a fifth card "Δ Angebot/Soll" showing `totals.offerVsEstimate` with green/red coloring. Grid becomes `md:grid-cols-5` when active.

### 5. Table column
When `offersActive`, add "Δ Angebot/Soll" header after "Angebot (brutto)". Per row: render `c.offerVsEstimate` with sign and color; show "–" when row has no offer and no estimate. Update `colSpan` from 8 to 9.

### 6. No changes to DetailPanel
No delta breakdown needed there in this phase.

## Display rules
- Column + card only visible when `offersActive`
- Delta is display-only — does not affect existing Ist/Soll difference or percentage

## Unchanged
- `difference` and `percentage` remain `actualBrutto - estimatedBrutto`
- Estimate version selection, invoice logic, offer selector, DetailPanel
- All other files

| File | Change |
|------|--------|
| `src/pages/Comparison.tsx` | Add `offerVsEstimate` field, totals reduction, column, summary card |

