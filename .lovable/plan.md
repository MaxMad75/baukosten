
# Brutto/Netto fuer Rechnungen + Soll/Ist-Vergleich mit Details

## Uebersicht

Drei Aenderungen:
1. Rechnungen erhalten ein `is_gross`-Feld (Default: `true`, da Rechnungsbetraege normalerweise brutto sind)
2. Der Soll/Ist-Vergleich rechnet alles einheitlich auf Brutto um und zeigt Netto/MwSt/Brutto-Aufschluesselung
3. Jede Zeile im Soll/Ist-Vergleich ist klickbar und zeigt die zugehoerigen Rechnungen und Schaetzungspositionen

## 1. Datenbank-Migration

Neue Spalte `is_gross` in der Tabelle `invoices`, Default `true` (Rechnungen sind typischerweise brutto):

```text
invoices
  + is_gross  BOOLEAN  NOT NULL  DEFAULT true
```

## 2. Typ-Aenderungen (`src/lib/types.ts`)

- `Invoice`: Neues Feld `is_gross: boolean`

## 3. Rechnungen (`src/pages/Invoices.tsx` + `src/hooks/useInvoices.ts`)

### Hook
- `createInvoice`: Feld `is_gross` mitsenden
- `updateInvoice`: Feld `is_gross` mitsenden (schon generisch, kein Code noetig)

### Rechnungstabelle
- Neue Spalte "Brutto/Netto" in der Tabelle, die anzeigt ob der Betrag inkl. oder exkl. MwSt ist
- In der Tabelle wird neben dem Betrag ein kleines Label "(brutto)" oder "(netto)" angezeigt

### Bearbeitungsdialog
- Neue Checkbox "Betrag inkl. MwSt (brutto)" im Edit-Dialog
- Default ist angehakt (brutto), da Rechnungsbetraege normalerweise brutto angegeben werden

## 4. Soll/Ist-Vergleich (`src/pages/Comparison.tsx`)

### Einheitliche Berechnung
Alle Betraege werden auf Brutto normalisiert fuer den Vergleich:
- Rechnungen: `brutto = is_gross ? amount : amount * 1.19`
- Schaetzungen: `brutto = is_gross ? amount : amount * 1.19`

### Summen-Cards (oben)
Statt nur Gesamt werden angezeigt:
- Geschaetzt (Brutto)
- Tatsaechlich (Brutto)
- Differenz

### Klickbare Detail-Ansicht
Jede Zeile in der Vergleichstabelle wird klickbar. Beim Klick oeffnet sich darunter (Collapsible/Accordion) eine Detail-Ansicht mit:

**Schaetzungspositionen:**
| Betrag | Netto/Brutto | Quelle (Dokument) |

**Rechnungen:**
| Datum | Firma | Betrag | Netto/Brutto | Bezahlt |

Und eine Zusammenfassung: Netto-Summe, MwSt, Brutto-Summe fuer beide Seiten.

## 5. Export-Anpassung (`src/utils/excelExport.ts`)

Der Excel-Export beruecksichtigt das neue `is_gross`-Feld bei Rechnungen und zeigt in der Rechnungsliste eine zusaetzliche Spalte "Brutto/Netto".

---

## Technische Details

| Datei | Aenderung |
|-------|-----------|
| DB-Migration | `is_gross` Spalte in `invoices` (Default `true`) |
| `src/lib/types.ts` | `is_gross` in `Invoice` |
| `src/hooks/useInvoices.ts` | `is_gross` bei `createInvoice` |
| `src/pages/Invoices.tsx` | Checkbox im Edit-Dialog, Label in Tabelle |
| `src/pages/Comparison.tsx` | Brutto-Normalisierung, klickbare Zeilen mit Accordion-Details |
| `src/utils/excelExport.ts` | Brutto/Netto-Spalte im Export |
