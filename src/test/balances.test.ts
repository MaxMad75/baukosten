import { describe, it, expect } from "vitest";
import { computeBalances, computeSettlements } from "@/components/invoices/BalanceCard";

const anna = { id: 'a', name: 'Anna' };
const ben = { id: 'b', name: 'Ben' };
const cleo = { id: 'c', name: 'Cleo' };

const paid = (entries: [string, number][]) => new Map(entries);

describe("computeBalances", () => {
  it("uses an equal split by default", () => {
    const balances = computeBalances([anna, ben], paid([['a', 8000], ['b', 2000]]));
    expect(balances[0]).toMatchObject({ name: 'Anna', paid: 8000, target: 5000, diff: 3000 });
    expect(balances[1]).toMatchObject({ name: 'Ben', paid: 2000, target: 5000, diff: -3000 });
  });

  it("applies a stored quota (60/40)", () => {
    const balances = computeBalances([anna, ben], paid([['a', 6000], ['b', 4000]]), { a: 60, b: 40 });
    expect(balances[0].diff).toBe(0);
    expect(balances[1].diff).toBe(0);
  });

  it("normalizes quotas that do not sum to 100", () => {
    const balances = computeBalances([anna, ben], paid([['a', 500], ['b', 500]]), { a: 30, b: 10 });
    expect(balances[0].sharePercent).toBe(75);
    expect(balances[1].sharePercent).toBe(25);
  });

  it("treats missing profiles in the quota as 0", () => {
    const balances = computeBalances([anna, ben, cleo], paid([['a', 900]]), { a: 50, b: 50 });
    expect(balances[2].target).toBe(0);
    expect(balances[2].diff).toBe(0);
  });
});

describe("computeSettlements", () => {
  it("produces a single transfer for two persons", () => {
    const balances = computeBalances([anna, ben], paid([['a', 8000], ['b', 2000]]));
    const settlements = computeSettlements(balances);
    expect(settlements).toEqual([{ from: 'Ben', to: 'Anna', amount: 3000 }]);
  });

  it("settles three persons with minimal transfers", () => {
    const balances = computeBalances([anna, ben, cleo], paid([['a', 9000], ['b', 0], ['c', 0]]));
    const settlements = computeSettlements(balances);
    expect(settlements).toHaveLength(2);
    expect(settlements.every((s) => s.to === 'Anna')).toBe(true);
    expect(settlements.reduce((s, x) => s + x.amount, 0)).toBe(6000);
  });

  it("returns nothing when balanced", () => {
    const balances = computeBalances([anna, ben], paid([['a', 500], ['b', 500]]));
    expect(computeSettlements(balances)).toEqual([]);
  });
});
