
# Drei neue Features: Firma aus Rechnung, Kuchendiagramm, Betraege ausblenden

## Uebersicht

1. **Firma aus bestehender Rechnung anlegen**: Im "Neue Firma"-Dialog koennen Rechnungen als Datenquelle ausgewaehlt werden, um Firmennamen (und ggf. weitere OCR-Daten) zu uebernehmen.
2. **Kuchendiagramm auf der Rechnungsseite**: Zeigt, wer im Haushalt wieviel bezahlt hat (Prozent + Euro).
3. **Globaler Datenschutz-Toggle**: Blendet alle Euro-Betraege in der gesamten App aus und zeigt stattdessen `***` an.

---

## 1. Firma aus Rechnung anlegen

### Ablauf
Auf der Firmen-Seite im "Neue Firma"-Dialog wird ein optionaler Bereich ergaenzt:
- Ein Dropdown/Select "Daten aus Rechnung uebernehmen" listet alle vorhandenen Rechnungen auf (Firma + Datum)
- Bei Auswahl wird der Firmenname automatisch in das Formular uebernommen
- Falls die Rechnung per KI extrahiert wurde (`ai_extracted = true`), koennte auch die Beschreibung als Notiz uebernommen werden
- Der Nutzer kann die Daten vor dem Speichern noch anpassen

### Technische Umsetzung

| Datei | Aenderung |
|-------|-----------|
| `src/pages/Contractors.tsx` | Import `useInvoices`, Select-Feld im ContractorForm fuer Rechnungsauswahl, Auto-Fill Logik |

Keine Datenbank-Aenderungen noetig.

---

## 2. Kuchendiagramm "Wer hat wieviel bezahlt"

### Darstellung
Unterhalb der Statistik-Cards auf der Rechnungsseite erscheint ein neues Card mit einem Kuchendiagramm (recharts `PieChart`):
- Jedes Haushaltsmitglied das Rechnungen bezahlt hat, bekommt ein Segment
- Tooltip und Legende zeigen Name, Euro-Betrag und Prozentanteil
- Unbezahlte Rechnungen werden nicht beruecksichtigt

### Technische Umsetzung

| Datei | Aenderung |
|-------|-----------|
| `src/pages/Invoices.tsx` | Import von `PieChart, Pie, Cell, Tooltip, Legend` aus recharts, Berechnung der Anteile pro `paid_by_profile_id`, neues Card mit Chart |

Keine Datenbank-Aenderungen noetig. `recharts` ist bereits installiert.

---

## 3. Globaler Datenschutz-Modus (Betraege ausblenden)

### Konzept
Ein Toggle-Button (z.B. Augen-Icon) in der Header-Leiste der App. Wenn aktiviert:
- Alle Euro-Betraege werden als `***` angezeigt
- Prozentangaben und andere Daten bleiben sichtbar
- Der Zustand wird per React Context global bereitgestellt
- Der Zustand wird nur im Browser-Session gehalten (kein Speichern in DB)

### Ablauf
- Neuer `PrivacyContext` mit `isPrivate` boolean und `togglePrivacy` Funktion
- Eine Hilfsfunktion `formatAmount(amount)` die entweder den formatierten Euro-Betrag oder `***` zurueckgibt
- Der Toggle wird im Header neben dem Benutzernamen platziert (Eye/EyeOff Icon)

### Technische Umsetzung

| Datei | Aenderung |
|-------|-----------|
| `src/contexts/PrivacyContext.tsx` | Neuer Context mit `isPrivate` State und `togglePrivacy` |
| `src/main.tsx` oder `src/App.tsx` | PrivacyProvider einbinden |
| `src/components/Layout.tsx` | Toggle-Button im Header (Eye/EyeOff) |
| `src/pages/Invoices.tsx` | `formatCurrency` durch privacy-aware Variante ersetzen |
| `src/pages/Estimates.tsx` | Gleiche Anpassung |
| `src/pages/Comparison.tsx` | Gleiche Anpassung |
| `src/pages/Dashboard.tsx` | Gleiche Anpassung (falls Betraege angezeigt werden) |
| `src/pages/Export.tsx` | Gleiche Anpassung (falls Betraege angezeigt werden) |

### Hilfsfunktion
Ein Custom Hook `usePrivacy()` stellt bereit:
- `isPrivate: boolean`
- `togglePrivacy: () => void`  
- `formatAmount: (amount: number) => string` - gibt `***` oder den formatierten Betrag zurueck

---

## Zusammenfassung

| Feature | Dateien | DB-Aenderung |
|---------|---------|-------------|
| Firma aus Rechnung | `Contractors.tsx` | Nein |
| Kuchendiagramm | `Invoices.tsx` | Nein |
| Privacy-Toggle | Neuer Context + Layout + alle Seiten mit Betraegen | Nein |

Keine Datenbank-Migrationen erforderlich. Alle drei Features sind reine Frontend-Aenderungen.
