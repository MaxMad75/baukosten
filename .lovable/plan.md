
# MwSt-Handling fuer Kostenschaetzungen

## Uebersicht

Jede Kostenposition erhaelt ein Kennzeichen, ob der Betrag bereits Brutto (inkl. 19% MwSt) oder Netto ist. In der Summenzeile werden dann Netto-Gesamt, MwSt-Anteil und Brutto-Gesamt separat ausgewiesen.

## Datenbank-Migration

Neue Spalte `is_gross` (boolean, Default `false`) in der Tabelle `architect_estimate_items`. Bestehende Positionen werden als Netto behandelt.

```text
architect_estimate_items
  + is_gross  BOOLEAN  NOT NULL  DEFAULT false
```

## UI-Aenderungen in `src/pages/Estimates.tsx`

### 1. Alle Positionstabellen (Upload-Dialog, Manuell-Dialog, Bestandsliste)

Jede Zeile erhaelt eine Checkbox "inkl. MwSt":
- Angehakt = Betrag ist bereits Brutto (inkl. 19% MwSt)
- Nicht angehakt = Betrag ist Netto (MwSt wird aufgeschlagen)

### 2. Summenbereich (alle drei Kontexte)

Statt nur einer "Gesamt"-Zeile werden drei Zeilen angezeigt:

```text
Netto-Summe:    XXX.XXX,XX EUR    (alle Betraege auf Netto umgerechnet)
+ MwSt (19%):    XX.XXX,XX EUR
Brutto-Summe:  XXX.XXX,XX EUR    (alle Betraege auf Brutto umgerechnet)
```

Berechnung pro Position:
- Wenn `is_gross = true`: Netto = Betrag / 1.19
- Wenn `is_gross = false`: Brutto = Betrag * 1.19

### 3. Betroffene Stellen

| Stelle | Aenderung |
|--------|-----------|
| Upload-Dialog: extrahierte Items Tabelle (Zeile ~664-717) | Checkbox-Spalte + Summe netto/mwst/brutto |
| Upload-Dialog: "Position hinzufuegen" Form (Zeile ~641-661) | Checkbox fuer neuen Eintrag |
| Manuell-Dialog: Items Tabelle (Zeile ~796-839) | Checkbox-Spalte + Summe netto/mwst/brutto |
| Manuell-Dialog: "Position hinzufuegen" Form (Zeile ~767-793) | Checkbox fuer neuen Eintrag |
| Bestandsliste: Accordion Items (Zeile ~913-1006) | Checkbox-Spalte + Summe netto/mwst/brutto |
| Bestandsliste: Edit-Modus (Zeile ~928-971) | Checkbox editierbar |
| Gesamtschaetzung Summary Card (Zeile ~857-871) | Netto/MwSt/Brutto Aufschluesselung |

### 4. State-Anpassungen

- `extractedItems` und `manualItems`: Neues Feld `is_gross: boolean` (Default `false`)
- `editFormData`: Neues Feld `is_gross`
- `newManualItem` und `manualItem`: Neues Feld `is_gross`

## Hook-Aenderungen in `src/hooks/useEstimates.ts`

- `addEstimateItems`: Feld `is_gross` mitsenden
- `updateEstimateItem`: Feld `is_gross` mitsenden

## Typ-Aenderungen in `src/lib/types.ts`

- `ArchitectEstimateItem`: Neues Feld `is_gross: boolean`
- `ExtractedEstimateData.items`: Neues Feld `is_gross: boolean`

## Dateien

| Datei | Aenderung |
|-------|-----------|
| DB-Migration | `is_gross` Spalte hinzufuegen |
| `src/lib/types.ts` | `is_gross` in Typen |
| `src/hooks/useEstimates.ts` | `is_gross` bei Insert/Update |
| `src/pages/Estimates.tsx` | Checkboxen, Summenberechnung netto/mwst/brutto |
