

# Fix: Fokus-Verlust in allen Formulardialogen

## Problem

Dasselbe Problem wie bei den Firmen: `EntryForm` und `DocumentForm` sind als Inline-Funktionen innerhalb ihrer jeweiligen Seiten-Komponenten definiert. Bei jeder State-Aenderung (Tippen) wird die Funktion neu erstellt, React behandelt sie als neue Komponente und der Input-Fokus geht verloren.

## Betroffene Dateien

| Datei | Inline-Komponente | Verwendungsstellen |
|-------|-------------------|-------------------|
| `src/pages/ConstructionJournal.tsx` | `EntryForm` (Zeile 169) | Create-Dialog (ca. Zeile 238) und Edit-Dialog (ca. Zeile 303) |
| `src/pages/Documents.tsx` | `DocumentForm` (Zeile 302) | Create-Dialog und Edit-Dialog |

## Loesung

Wie beim Firmen-Fix: Die Inline-Funktionskomponenten entfernen und den JSX-Inhalt direkt in die jeweiligen Dialoge einbetten.

### ConstructionJournal.tsx
- `EntryForm`-Funktion (Zeile 169 ff.) entfernen
- Den Formular-JSX direkt in den Create-Dialog und den Edit-Dialog kopieren
- `onSubmit` wird durch den jeweiligen Handler (`handleCreate` / `handleUpdate`) ersetzt
- `submitLabel` wird durch den jeweiligen Text ersetzt

### Documents.tsx
- `DocumentForm`-Funktion (Zeile 302 ff.) entfernen
- Den Formular-JSX direkt in den Create-Dialog und den Edit-Dialog kopieren
- Gleiche Vorgehensweise wie oben

## Technische Details

Der Kern des Problems: Eine Funktion die innerhalb einer Komponente definiert wird (`const EntryForm = () => ...`) erhaelt bei jedem Render eine neue Referenz. React vergleicht Komponenten-Typen per Referenz - neue Referenz bedeutet neue Komponente, also unmount + remount, also Fokus-Verlust.

Durch direktes Einbetten des JSX entfaellt die Komponenten-Grenze und React kann die DOM-Elemente stabil halten.

Keine Datenbank-Aenderungen noetig.

