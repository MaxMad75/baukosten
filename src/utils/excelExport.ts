import * as XLSX from 'xlsx';
import { Invoice, ArchitectEstimateItem, DIN276Kostengruppe, Profile, CostComparison } from '@/lib/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ExportData {
  invoices: Invoice[];
  estimateItems: ArchitectEstimateItem[];
  kostengruppen: DIN276Kostengruppe[];
  profiles: Profile[];
  comparisons: CostComparison[];
}

export function exportToExcel(data: ExportData, fileName: string = 'hausbau-export') {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Übersicht (Summary)
  const summaryData = createSummarySheet(data);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Übersicht');

  // Sheet 2: Alle Rechnungen
  const invoicesData = createInvoicesSheet(data);
  const invoicesSheet = XLSX.utils.aoa_to_sheet(invoicesData);
  XLSX.utils.book_append_sheet(workbook, invoicesSheet, 'Rechnungen');

  // Sheet 3: Soll-Ist-Vergleich
  const comparisonData = createComparisonSheet(data);
  const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
  XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Soll-Ist');

  // Sheet 4: Nach Kostengruppe
  const byKGData = createByKostengruppeSheet(data);
  const byKGSheet = XLSX.utils.aoa_to_sheet(byKGData);
  XLSX.utils.book_append_sheet(workbook, byKGSheet, 'Nach Kostengruppe');

  // Sheet 5: Nach Zahler
  const byPayerData = createByPayerSheet(data);
  const byPayerSheet = XLSX.utils.aoa_to_sheet(byPayerData);
  XLSX.utils.book_append_sheet(workbook, byPayerSheet, 'Nach Zahler');

  // Generate file
  const dateStr = format(new Date(), 'yyyy-MM-dd', { locale: de });
  XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
}

function createSummarySheet(data: ExportData): any[][] {
  const totalEstimated = data.comparisons.reduce((sum, c) => sum + c.estimated, 0);
  const totalActual = data.comparisons.reduce((sum, c) => sum + c.actual, 0);
  const paidInvoices = data.invoices.filter(i => i.is_paid);
  const unpaidInvoices = data.invoices.filter(i => !i.is_paid);

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
    ['Summe bezahlt', formatCurrency(paidInvoices.reduce((s, i) => s + Number(i.amount), 0))],
    ['Summe offen', formatCurrency(unpaidInvoices.reduce((s, i) => s + Number(i.amount), 0))],
  ];
}

function createInvoicesSheet(data: ExportData): any[][] {
  const header = [
    'Rechnungsnr.',
    'Datum',
    'Firma',
    'Beschreibung',
    'Kostengruppe',
    'Betrag',
    'Bezahlt',
    'Zahlungsdatum',
    'Bezahlt von',
  ];

  const rows = data.invoices.map(inv => {
    const kg = data.kostengruppen.find(k => k.code === inv.kostengruppe_code);
    const payer = data.profiles.find(p => p.id === inv.paid_by_profile_id);
    
    return [
      inv.invoice_number || '-',
      format(new Date(inv.invoice_date), 'dd.MM.yyyy', { locale: de }),
      inv.company_name,
      inv.description || '-',
      kg ? `${kg.code} - ${kg.name}` : inv.kostengruppe_code || '-',
      Number(inv.amount),
      inv.is_paid ? 'Ja' : 'Nein',
      inv.payment_date ? format(new Date(inv.payment_date), 'dd.MM.yyyy', { locale: de }) : '-',
      payer?.name || '-',
    ];
  });

  return [header, ...rows];
}

function createComparisonSheet(data: ExportData): any[][] {
  const header = [
    'Kostengruppe',
    'Bezeichnung',
    'Soll (geschätzt)',
    'Ist (tatsächlich)',
    'Differenz',
    'Abweichung %',
  ];

  const rows = data.comparisons.map(c => [
    c.kostengruppe_code,
    c.kostengruppe_name,
    c.estimated,
    c.actual,
    c.difference,
    c.estimated > 0 ? `${c.percentage.toFixed(1)}%` : '-',
  ]);

  const totalRow = [
    '',
    'GESAMT',
    data.comparisons.reduce((s, c) => s + c.estimated, 0),
    data.comparisons.reduce((s, c) => s + c.actual, 0),
    data.comparisons.reduce((s, c) => s + c.difference, 0),
    '',
  ];

  return [header, ...rows, [], totalRow];
}

function createByKostengruppeSheet(data: ExportData): any[][] {
  const grouped: Record<string, { name: string; invoices: Invoice[] }> = {};

  data.invoices.forEach(inv => {
    const code = inv.kostengruppe_code || 'Ohne Zuordnung';
    const kg = data.kostengruppen.find(k => k.code === code);
    
    if (!grouped[code]) {
      grouped[code] = {
        name: kg?.name || 'Ohne Zuordnung',
        invoices: [],
      };
    }
    grouped[code].invoices.push(inv);
  });

  const result: any[][] = [['KOSTEN NACH KOSTENGRUPPE']];

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
      
      result.push([
        'Summe:',
        '',
        group.invoices.reduce((s, i) => s + Number(i.amount), 0),
        '',
      ]);
    });

  return result;
}

function createByPayerSheet(data: ExportData): any[][] {
  const result: any[][] = [['ZAHLUNGEN NACH PERSON']];

  data.profiles.forEach(profile => {
    const paidByProfile = data.invoices.filter(
      i => i.is_paid && i.paid_by_profile_id === profile.id
    );
    
    result.push([]);
    result.push([profile.name]);
    result.push(['Anzahl Zahlungen:', paidByProfile.length]);
    result.push(['Gesamtbetrag:', formatCurrency(paidByProfile.reduce((s, i) => s + Number(i.amount), 0))]);
    
    if (paidByProfile.length > 0) {
      result.push([]);
      result.push(['Firma', 'Datum', 'Zahlungsdatum', 'Betrag']);
      paidByProfile.forEach(inv => {
        result.push([
          inv.company_name,
          format(new Date(inv.invoice_date), 'dd.MM.yyyy', { locale: de }),
          inv.payment_date ? format(new Date(inv.payment_date), 'dd.MM.yyyy', { locale: de }) : '-',
          Number(inv.amount),
        ]);
      });
    }
  });

  return result;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}
