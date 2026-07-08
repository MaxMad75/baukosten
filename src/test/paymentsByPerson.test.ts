import { describe, it, expect } from "vitest";
import { buildPaymentsByPerson } from "@/components/invoices/PaymentsByPersonCard";
import { Invoice, InvoicePayment } from "@/lib/types";

const anna = { id: 'a', name: 'Anna' };
const ben = { id: 'b', name: 'Ben' };
const bank = { id: 'k', name: 'Bankkredit' };

const invoice = (id: string, amount: number, date: string): Invoice =>
  ({ id, amount, invoice_date: date, company_name: `Firma ${id}` } as Invoice);

const payment = (invoice_id: string, profile_id: string, amount: number): InvoicePayment =>
  ({ id: `${invoice_id}-${profile_id}-${amount}`, invoice_id, profile_id, amount } as InvoicePayment);

const invoices = [
  invoice('r1', 10000, '2026-01-10'),
  invoice('r2', 5000, '2026-03-01'),
];

describe("buildPaymentsByPerson", () => {
  it("groups payments per person and invoice with share of total", () => {
    const result = buildPaymentsByPerson([anna, ben, bank], invoices, [
      payment('r1', 'a', 4000),
      payment('r1', 'k', 6000),
      payment('r2', 'a', 2500),
      payment('r2', 'a', 2500), // zwei Teilzahlungen derselben Person
    ]);

    expect(result.map((p) => p.name)).toEqual(['Anna', 'Bankkredit']); // sortiert nach Summe, Ben ohne Zahlungen fehlt
    const [a, k] = result;
    expect(a.total).toBe(9000);
    expect(a.sharePercent).toBe(60);
    expect(a.items).toHaveLength(2); // r2-Teilzahlungen aggregiert
    expect(a.items[0].invoice.id).toBe('r2'); // neueste zuerst
    expect(a.items[0].amount).toBe(5000);
    expect(k.total).toBe(6000);
    expect(k.sharePercent).toBe(40);
  });

  it("ignores payments for unknown invoices and returns empty for no payments", () => {
    expect(buildPaymentsByPerson([anna], invoices, [])).toEqual([]);
    const result = buildPaymentsByPerson([anna], invoices, [payment('gone', 'a', 100)]);
    expect(result).toEqual([]);
  });
});
