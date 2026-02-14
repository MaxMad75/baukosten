

# Fix: Dialog verliert Fokus bei Tastatureingabe

## Problem

`ContractorForm` ist als Inline-Funktion innerhalb der `Contractors`-Komponente definiert (Zeile 134-195). Bei jeder State-Aenderung (z.B. Tippen in ein Feld aendert `formData`) wird `Contractors` neu gerendert und eine **neue** `ContractorForm`-Funktion erstellt. React erkennt diese als voellig neue Komponente, entfernt die alte und mountet die neue — dadurch geht der Input-Fokus verloren.

## Loesung

Die `ContractorForm`-Inline-Funktion wird entfernt und der JSX-Inhalt direkt an den beiden Verwendungsstellen (Create-Dialog Zeile 218 und Edit-Dialog Zeile 307) eingebettet. Das vermeidet die Neuerstellung einer Komponente bei jedem Render.

Alternativ koennte man `ContractorForm` aus der Komponente herausziehen, aber da sie auf viele lokale State-Variablen zugreift (`formData`, `setFormData`, `invoices`, etc.), ist das direkte Inlining einfacher.

## Betroffene Datei

| Datei | Aenderung |
|-------|-----------|
| `src/pages/Contractors.tsx` | `ContractorForm`-Funktion (Zeile 134-195) entfernen und den JSX direkt in den Create-Dialog (Zeile 218) und Edit-Dialog (Zeile 307) einsetzen |

## Technische Details

- Zeile 134-195: Die `ContractorForm` Arrow-Function wird geloescht
- Zeile 218: Wird ersetzt durch den vollen Formular-JSX (mit `showInvoiceSelect`-Bereich)
- Zeile 307: Wird ersetzt durch den vollen Formular-JSX (ohne `showInvoiceSelect`-Bereich)
- Keine weiteren Dateien oder Datenbank-Aenderungen betroffen

