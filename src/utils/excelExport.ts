import * as XLSX from '@e965/xlsx';
import { Invoice, ArchitectEstimateItem, DIN276Kostengruppe, Profile, CostComparison, InvoicePayment, InvoiceDeduction, DEDUCTION_TYPE_LABELS } from '@/lib/types';
import { aggregatePaymentsByProfile } from '@/hooks/useInvoicePayments';
import { getPayableAmount } from '@/hooks/useInvoiceDeductions';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

type SheetRow = (string | number)[];

interface ExportData {
  invoices: Invoice[];
  estimateItems: ArchitectEstimateItem[];
  kostengruppen: DIN276Kostengruppe[];
  profiles: Profile[];
  comparisons: CostComparison[];
  payments?: InvoicePayment[];
  deductions?: InvoiceDeduction[];
}

export function exportToExcel(data: ExportData, fileName: string = 'hausbau-export') {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet(createSummarySheet(data));
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Übersicht');

  const invoicesSheet = XLSX.utils.aoa_to_sheet(createInvoicesSheet(data));
  XLSX.utils.book_append_sheet(workbook, invoicesSheet, 'Rechnungen');

  const comparisonSheet = XLSX.utils.aoa_to_sheet(createComparisonSheet(data));
  XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Soll-Ist');

  const byKGSheet = XLSX.utils.aoa_to_sheet(createByKostengruppeSheet(data));
  XLSX.utils.book_append_sheet(workbook, byKGSheet, 'Nach Kostengruppe');

  const byPayerSheet = XLSX.utils.aoa_to_sheet(createByPayerSheet(data));
  XLSX.utils.book_append_sheet(workbook, byPayerSheet, 'Nach Zahler');

  const dateStr = format(new Date(), 'yyyy-MM-dd', { locale: de });
  XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
}

function createSummarySheet(data: ExportData): SheetRow[] {
  const totalEstimated = data.comparisons.reduce((sum, c) => sum + c.estimated, 0);
  const totalActual = data.comparisons.reduce((sum, c) => sum + c.actual, 0);
  const paidInvoices = data.invoices.filter(i => i.is_paid);
  const unpaidInvoices = data.invoices.filter(i => !i.is_paid);
  const deductions = data.deductions || [];
  const payments = data.payments || [];

  // Zahlbetrag-basierte Summen: Abzüge (Skonto, Einbehalte …) reduzieren,
  // was tatsächlich zu überweisen ist.
  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount), 0);
  const totalRetention = deductions
    .filter(d => d.deduction_type === 'sicherheitseinbehalt')
    .reduce((s, d) => s + Number(d.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPayable = data.invoices
    .filter(i => i.status !== 'cancelled')
    .reduce((s, i) => s + getPayableAmount(Number(i.amount), deductions.filter(d => d.invoice_id === i.id)), 0);

  return [
    ['HAUSBAU KOSTEN-ÜBERSICHT'],
    ['Erstellt am:', format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })],
    [],
    ['ZUSAMMENFASSUNG'],
    ['Kategorie', 'Betrag'],
    ['Geschätzte Gesamtkosten', formatCurrency(totalEstimated)],
    ['Tatsächliche Gesamtkosten', formatCurrency(totalActual)],
    ['Differenz', formatCurrency(totalActual - totalEstimated)],
    ['Abweichung %', totalEstimated > 0 ? `${(((totalActual - totalEstimated) / totalEstimated) * 100).toFixed(1)}%` : '-'],
    [],
    ['RECHNUNGEN'],
    ['Anzahl Rechnungen gesamt', data.invoices.length],
    ['Davon bezahlt', paidInvoices.length],
    ['Davon offen', unpaidInvoices.length],
    ['Rechnungssumme gesamt', formatCurrency(data.invoices.reduce((s, i) => s + Number(i.amount), 0))],
    ['Summe Abzüge (Skonto, Einbehalte, …)', formatCurrency(totalDeductions)],
    ['Davon Sicherheitseinbehalte (können noch fällig werden)', formatCurrency(totalRetention)],
    ['Zahlbetrag gesamt (nach Abzügen)', formatCurrency(totalPayable)],
    ['Summe bezahlt (erfasste Zahlungen)', formatCurrency(totalPaid)],
    ['Summe offen (Zahlbetrag − bezahlt)', formatCurrency(Math.max(totalPayable - totalPaid, 0))],
  ];
}

function createInvoicesSheet(data: ExportData): SheetRow[] {
  const header = [
    'Belegart', 'Rechnungsnr.', 'Datum', 'Firma', 'Beschreibung', 'Kostengruppe',
    'Betrag', 'Abzüge', 'Zahlbetrag', 'Brutto/Netto', 'Status', 'Bezahlt', 'Zahlungsdatum', 'Bezahlt von', 'Aufteilung',
  ];

  const rows = data.invoices.map(inv => {
    const kg = data.kostengruppen.find(k => k.code === inv.kostengruppe_code);
    const invPayments = (data.payments || []).filter(p => p.invoice_id === inv.id);
    const invDeductions = (data.deductions || []).filter(d => d.invoice_id === inv.id);
    const deductionInfo = invDeductions.length > 0
      ? invDeductions.map(d => `${d.deduction_type === 'sonstiges' && d.label ? d.label : DEDUCTION_TYPE_LABELS[d.deduction_type]}: ${formatCurrency(Number(d.amount))}`).join('; ')
      : '-';
    const payerAmounts = aggregatePaymentsByProfile(invPayments);
    const payerInfo = payerAmounts.size > 0
      ? Array.from(payerAmounts.entries()).map(([profileId, amount]) => {
          const p = data.profiles.find(pr => pr.id === profileId);
          return `${p?.name || '?'}: ${formatCurrency(amount)}`;
        }).join('; ')
      : '-';

    return [
      // Eigenbelege müssen im Export erkennbar bleiben: für die Steuer ist der
      // Unterschied zur Fremdrechnung wesentlich.
      inv.is_self_receipt ? 'Eigenbeleg' : 'Rechnung',
      inv.invoice_number || '-',
      format(new Date(inv.invoice_date), 'dd.MM.yyyy', { locale: de }),
      inv.company_name,
      inv.description || '-',
      kg ? `${kg.code} - ${kg.name}` : inv.kostengruppe_code || '-',
      Number(inv.amount),
      deductionInfo,
      getPayableAmount(Number(inv.amount), invDeductions),
      inv.is_gross ? 'Brutto' : 'Netto',
      inv.status || (inv.is_paid ? 'paid' : 'draft'),
      inv.is_paid ? 'Ja' : 'Nein',
      inv.payment_date ? format(new Date(inv.payment_date), 'dd.MM.yyyy', { locale: de }) : '-',
      payerInfo,
      payerAmounts.size > 1 ? 'Aufgeteilt' : 'Einzelzahler',
    ];
  });

  return [header, ...rows];
}

function createComparisonSheet(data: ExportData): SheetRow[] {
  // Zeilen kommen seit 12.07.2026 aus den Firmen-Blöcken der Budget-Seite
  const header = ['Abschnitt', 'Firma / Posten', 'Soll (Kostenberechnung, brutto)', 'Ist (Zahlbeträge, brutto)', 'Differenz', 'Abweichung %'];

  const rows = data.comparisons.map(c => [
    c.kostengruppe_code, c.kostengruppe_name, c.estimated, c.actual, c.difference,
    c.estimated > 0 ? `${c.percentage.toFixed(1)}%` : '-',
  ]);

  const totalRow = [
    '', 'GESAMT',
    data.comparisons.reduce((s, c) => s + c.estimated, 0),
    data.comparisons.reduce((s, c) => s + c.actual, 0),
    data.comparisons.reduce((s, c) => s + c.difference, 0),
    '',
  ];

  return [header, ...rows, [], totalRow];
}

function createByKostengruppeSheet(data: ExportData): SheetRow[] {
  const grouped: Record<string, { name: string; invoices: Invoice[] }> = {};

  data.invoices.forEach(inv => {
    const code = inv.kostengruppe_code || 'Ohne Zuordnung';
    const kg = data.kostengruppen.find(k => k.code === code);
    if (!grouped[code]) {
      grouped[code] = { name: kg?.name || 'Ohne Zuordnung', invoices: [] };
    }
    grouped[code].invoices.push(inv);
  });

  const result: SheetRow[] = [['KOSTEN NACH KOSTENGRUPPE']];

  Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([code, group]) => {
      result.push([]);
      result.push([`${code} - ${group.name}`]);
      result.push(['Firma', 'Datum', 'Betrag', 'Bezahlt']);
      group.invoices.forEach(inv => {
        result.push([
          inv.company_name,
          format(new Date(inv.invoice_date), 'dd.MM.yyyy', { locale: de }),
          Number(inv.amount),
          inv.is_paid ? 'Ja' : 'Nein',
        ]);
      });
      result.push(['Summe:', '', group.invoices.reduce((s, i) => s + Number(i.amount), 0), '']);
    });

  return result;
}

function createByPayerSheet(data: ExportData): SheetRow[] {
  const result: SheetRow[] = [['ZAHLUNGEN NACH PERSON (inkl. Aufteilungen)']];
  const payments = data.payments || [];

  data.profiles.forEach(profile => {
    const amounts = new Map<string, { invoice: Invoice; amount: number }>();

    // invoice_payments is the single source of truth
    for (const inv of data.invoices) {
      const invPayments = payments.filter(p => p.invoice_id === inv.id);
      const myAmount = aggregatePaymentsByProfile(invPayments).get(profile.id);
      if (myAmount && myAmount > 0) {
        amounts.set(inv.id, { invoice: inv, amount: myAmount });
      }
    }

    const entries = Array.from(amounts.values());
    const totalPaid = entries.reduce((s, e) => s + e.amount, 0);

    result.push([]);
    result.push([profile.name]);
    result.push(['Anzahl Beteiligungen:', entries.length]);
    result.push(['Gesamtbetrag:', formatCurrency(totalPaid)]);

    if (entries.length > 0) {
      result.push([]);
      result.push(['Firma', 'Datum', 'Rechnungsbetrag', 'Mein Anteil']);
      entries.forEach(({ invoice, amount }) => {
        result.push([
          invoice.company_name,
          format(new Date(invoice.invoice_date), 'dd.MM.yyyy', { locale: de }),
          Number(invoice.amount),
          amount,
        ]);
      });
    }
  });

  return result;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}
