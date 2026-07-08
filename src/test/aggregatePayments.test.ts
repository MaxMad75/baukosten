import { describe, it, expect } from "vitest";
import { aggregatePaymentsByProfile } from "@/hooks/useInvoicePayments";

describe("aggregatePaymentsByProfile", () => {
  it("sums payments per profile", () => {
    const map = aggregatePaymentsByProfile([
      { profile_id: 'anna', amount: 400 },
      { profile_id: 'ben', amount: 300 },
      { profile_id: 'anna', amount: 600 },
    ]);
    expect(map.get('anna')).toBe(1000);
    expect(map.get('ben')).toBe(300);
    expect(map.size).toBe(2);
  });

  it("handles string amounts from numeric DB columns", () => {
    const map = aggregatePaymentsByProfile([
      { profile_id: 'anna', amount: "199.99" as unknown as number },
      { profile_id: 'anna', amount: "0.01" as unknown as number },
    ]);
    expect(map.get('anna')).toBe(200);
  });

  it("returns an empty map for no payments", () => {
    expect(aggregatePaymentsByProfile([]).size).toBe(0);
  });
});
