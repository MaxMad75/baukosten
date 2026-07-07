import { describe, it, expect } from "vitest";
import { computeInvoiceStats } from "@/components/invoices/InvoiceStatsCards";
import { Invoice, InvoiceDeduction, InvoicePayment } from "@/lib/types";

const invoice = (id: string, amount: number, status: Invoice['status']): Invoice =>
  ({ id, amount, status } as Invoice);

const deduction = (invoice_id: string, amount: number): InvoiceDeduction =>
  ({ id: `d-${invoice_id}-${amount}`, invoice_id, amount, deduction_type: 'skonto' } as InvoiceDeduction);

const payment = (invoice_id: string, amount: number): InvoicePayment =>
  ({ id: `p-${invoice_id}-${amount}`, invoice_id, amount } as InvoicePayment);

describe("computeInvoiceStats", () => {
  it("measures against payable amounts and real payments", () => {
    const stats = computeInvoiceStats(
      [invoice('a', 10000, 'paid'), invoice('b', 5000, 'approved')],
      [deduction('a', 500)], // 3% Skonto etc.
      [payment('a', 9500)]
    );
    expect(stats.totalInvoiced).toBe(15000);
    expect(stats.totalDeductions).toBe(500);
    expect(stats.totalPayable).toBe(14500);
    expect(stats.totalPaid).toBe(9500);
    expect(stats.totalOpen).toBe(5000);
    expect(stats.paidCount).toBe(1);
    expect(stats.openCount).toBe(1);
  });

  it("excludes cancelled invoices and their payments", () => {
    const stats = computeInvoiceStats(
      [invoice('a', 1000, 'cancelled'), invoice('b', 2000, 'draft')],
      [deduction('a', 100)],
      [payment('a', 900)]
    );
    expect(stats.totalInvoiced).toBe(2000);
    expect(stats.totalPayable).toBe(2000);
    expect(stats.totalPaid).toBe(0);
    expect(stats.totalOpen).toBe(2000);
  });

  it("never reports negative open amounts on overpayment", () => {
    const stats = computeInvoiceStats(
      [invoice('a', 1000, 'paid')],
      [],
      [payment('a', 1200)]
    );
    expect(stats.totalOpen).toBe(0);
  });

  it("handles empty data", () => {
    const stats = computeInvoiceStats([], [], []);
    expect(stats.totalPayable).toBe(0);
    expect(stats.totalOpen).toBe(0);
  });
});
