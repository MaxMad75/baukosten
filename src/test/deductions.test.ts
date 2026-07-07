import { describe, it, expect } from "vitest";
import { getPayableAmount } from "@/hooks/useInvoiceDeductions";
import { deductionRowAmount, DeductionRow } from "@/components/invoices/DeductionsEditor";

const row = (patch: Partial<DeductionRow>): DeductionRow => ({
  deduction_type: 'skonto', label: '', mode: 'percent', percentage: '', amount: '', ...patch,
});

describe("getPayableAmount", () => {
  it("subtracts deductions from the invoice amount", () => {
    expect(getPayableAmount(10000, [{ amount: 300 }, { amount: 500 }])).toBe(9200);
  });

  it("returns the full amount without deductions", () => {
    expect(getPayableAmount(14280, [])).toBe(14280);
  });

  it("never goes below zero", () => {
    expect(getPayableAmount(100, [{ amount: 150 }])).toBe(0);
  });

  it("handles cent rounding", () => {
    expect(getPayableAmount(100.05, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(99.75);
  });
});

describe("deductionRowAmount", () => {
  it("computes percent rows against the invoice amount", () => {
    expect(deductionRowAmount(row({ mode: 'percent', percentage: '3' }), 10000)).toBe(300);
    expect(deductionRowAmount(row({ mode: 'percent', percentage: '5' }), 14280)).toBe(714);
  });

  it("uses the absolute amount directly", () => {
    expect(deductionRowAmount(row({ mode: 'absolute', amount: '123.45' }), 10000)).toBe(123.45);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(deductionRowAmount(row({ mode: 'percent', percentage: '' }), 10000)).toBe(0);
    expect(deductionRowAmount(row({ mode: 'absolute', amount: 'abc' }), 10000)).toBe(0);
  });

  it("rounds percent results to cents", () => {
    // 3% of 3333.33 = 99.9999 → 100.00
    expect(deductionRowAmount(row({ mode: 'percent', percentage: '3' }), 3333.33)).toBe(100);
  });
});
