

# Rechnungsaufteilung auf mehrere Zahler

## Uebersicht

Neue Tabelle `invoice_splits` speichert Kostenanteile pro Rechnung und Person. Die bestehende Einzelzahler-Logik (`paid_by_profile_id`) bleibt erhalten und wird als Fallback genutzt, wenn keine Splits existieren. Alle Auswertungen (Pie-Chart, Dashboard, Export, Soll/Ist) werden auf die neue Split-Logik umgestellt.

---

## 1. Datenbank-Migration

Neue Tabelle `invoice_splits`:

```text
invoice_splits
  id                uuid  PK  DEFAULT gen_random_uuid()
  invoice_id        uuid  NOT NULL  FK -> invoices(id) ON DELETE CASCADE
  profile_id        uuid  NOT NULL  FK -> profiles(id)
  amount            numeric  NOT NULL
  percentage        numeric  NULL
  split_type        text  NOT NULL  DEFAULT 'manual'   -- 'equal', 'manual', 'percentage'
  created_at        timestamptz  DEFAULT now()
```

RLS-Policies: SELECT/INSERT/UPDATE/DELETE ueber JOIN auf `invoices.household_id = get_user_household_id()`.

## 2. Typ-Aenderungen (`src/lib/types.ts`)

```text
+ InvoiceSplit { id, invoice_id, profile_id, amount, percentage, split_type, created_at }
```

## 3. Neuer Hook (`src/hooks/useInvoiceSplits.ts`)

- `fetchSplitsForInvoice(invoiceId)` — laedt alle Splits einer Rechnung
- `saveSplits(invoiceId, splits[])` — loescht bestehende Splits und inserted neue (Transaktion)
- `fetchAllSplits()` — laedt alle Splits des Haushalts (fuer Auswertungen)

## 4. Neue Komponente (`src/components/InvoiceSplitEditor.tsx`)

Eigenstaendige Komponente, die im Edit-Dialog und Pay-Dialog eingebettet wird:

**Props**: `invoiceAmount: number`, `profiles: Profile[]`, `splits: SplitEntry[]`, `onChange: (splits) => void`

**UI-Aufbau**:
- Drei Tabs/Buttons oben: "Gleichmaessig" | "Manuell" | "Prozentual"
- Darunter Liste der Personen mit jeweiligem Anteil
- "Person hinzufuegen"-Button (Dropdown mit verfuegbaren Haushaltsmitgliedern)
- Live-Anzeige: Gesamtbetrag | Verteilt | Restbetrag
- Validierung: Fehlermeldung wenn Summe != Rechnungsbetrag, Speichern-Button disabled

**Verhalten je Modus**:
- Gleichmaessig: Betrag wird automatisch auf alle ausgewaehlten Personen aufgeteilt
- Manuell: Freie Betrags-Eingabe pro Person
- Prozentual: Prozent-Eingabe pro Person, Betrag wird berechnet

## 5. UI-Aenderungen Rechnungsseite (`src/pages/Invoices.tsx`)

### Edit-Dialog
- Neuer Bereich "Kostenaufteilung" unterhalb der bestehenden Felder
- Einbettung der `InvoiceSplitEditor`-Komponente
- Beim Speichern: Rechnung updaten UND Splits speichern
- Default bei bestehenden Rechnungen ohne Splits: Kein Split (Einzelzahler-Logik greift)

### Pay-Dialog
- Erweitern: Statt nur einen Zahler auszuwaehlen, kann optional die Split-Komponente genutzt werden
- Toggle "Auf mehrere Personen aufteilen"
- Wenn aktiv: InvoiceSplitEditor anzeigen
- Wenn nicht aktiv: Bisherige Einzelzahler-Logik

### Tabelle
- Spalte "Status/Bezahlt von": Wenn Splits vorhanden, mehrere Namen anzeigen (z.B. "A: 60%, B: 40%")

### Pie-Chart
- Berechnung anpassen: Wenn Splits vorhanden, deren `amount` je Person verwenden. Ohne Splits: Fallback auf `paid_by_profile_id`.

## 6. Dashboard (`src/pages/Dashboard.tsx`)

- Keine strukturellen Aenderungen noetig; die Summen kommen weiterhin aus `invoices`
- Falls spaeter gewuenscht: Aufschluesselung pro Person

## 7. Soll/Ist-Vergleich (`src/pages/Comparison.tsx`)

- In der Detail-Ansicht bei Rechnungen: Falls Splits vorhanden, die Aufteilung anzeigen (wer traegt welchen Anteil)

## 8. Excel-Export (`src/utils/excelExport.ts`)

- Sheet "Nach Zahler": Anstatt nur `paid_by_profile_id` zu nutzen, Splits beruecksichtigen
- Neues Sheet oder erweiterte Spalten: "Anteil" pro Person bei aufgeteilten Rechnungen

## 9. Bestehende Logik / Abwaertskompatibilitaet

- `paid_by_profile_id` auf `invoices` bleibt bestehen
- Rechnungen ohne Eintraege in `invoice_splits` funktionieren wie bisher
- Hilfsfunktion `getEffectivePayerAmounts(invoice, splits)`: Gibt Map<profileId, amount> zurueck — nutzt Splits wenn vorhanden, sonst `paid_by_profile_id` mit vollem Betrag

---

## Dateien

| Datei | Aenderung |
|-------|-----------|
| DB-Migration | Neue Tabelle `invoice_splits` mit RLS |
| `src/lib/types.ts` | Neuer Typ `InvoiceSplit` |
| `src/hooks/useInvoiceSplits.ts` | Neuer Hook (CRUD fuer Splits) |
| `src/components/InvoiceSplitEditor.tsx` | Neue Komponente (Aufteilungs-UI) |
| `src/pages/Invoices.tsx` | Edit-Dialog + Pay-Dialog + Pie-Chart + Tabelle anpassen |
| `src/pages/Comparison.tsx` | Detail-Panel: Splits anzeigen |
| `src/utils/excelExport.ts` | Sheet "Nach Zahler" auf Splits umstellen |

