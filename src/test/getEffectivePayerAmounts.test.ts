import { describe, it, expect } from "vitest";
import { getEffectivePayerAmounts } from "@/hooks/useInvoiceSplits";
import { InvoiceSplit } from "@/lib/types";

const invoice = { amount: 1000, is_paid: true, paid_by_profile_id: "legacy-payer" };

const split = (profile_id: string, amount: number): InvoiceSplit => ({
  id: `split-${profile_id}`,
  invoice_id: "inv-1",
  profile_id,
  amount,
  percentage: null,
  split_type: "manual",
  created_at: "2026-01-01",
});

describe("getEffectivePayerAmounts", () => {
  it("uses payments as the primary source when present", () => {
    const result = getEffectivePayerAmounts(
      invoice,
      [split("anna", 500), split("ben", 500)],
      [
        { profile_id: "anna", amount: 700 },
        { profile_id: "ben", amount: 300 },
      ]
    );
    expect(result.get("anna")).toBe(700);
    expect(result.get("ben")).toBe(300);
    expect(result.has("legacy-payer")).toBe(false);
  });

  it("aggregates multiple payments by the same person", () => {
    const result = getEffectivePayerAmounts(invoice, [], [
      { profile_id: "anna", amount: 400 },
      { profile_id: "anna", amount: 600 },
    ]);
    expect(result.get("anna")).toBe(1000);
    expect(result.size).toBe(1);
  });

  it("falls back to splits when there are no payments (legacy data)", () => {
    const result = getEffectivePayerAmounts(invoice, [split("anna", 250), split("ben", 750)], []);
    expect(result.get("anna")).toBe(250);
    expect(result.get("ben")).toBe(750);
  });

  it("falls back to splits when payments argument is omitted", () => {
    const result = getEffectivePayerAmounts(invoice, [split("anna", 1000)]);
    expect(result.get("anna")).toBe(1000);
  });

  it("falls back to paid_by_profile_id when neither payments nor splits exist", () => {
    const result = getEffectivePayerAmounts(invoice, [], []);
    expect(result.get("legacy-payer")).toBe(1000);
    expect(result.size).toBe(1);
  });

  it("returns an empty map for unpaid invoices without payments or splits", () => {
    const result = getEffectivePayerAmounts(
      { amount: 1000, is_paid: false, paid_by_profile_id: null },
      [],
      []
    );
    expect(result.size).toBe(0);
  });

  it("handles string amounts from the database (numeric columns)", () => {
    const result = getEffectivePayerAmounts(invoice, [], [
      { profile_id: "anna", amount: "199.99" as unknown as number },
      { profile_id: "anna", amount: "0.01" as unknown as number },
    ]);
    expect(result.get("anna")).toBe(200);
  });
});
