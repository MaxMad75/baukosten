# Optimierungsplan Baukosten-App

Stand: 05.07.2026 — nach dem Umbau des Rechnungs-Workflows (Commits `5cb98b8`, `660860c`, `1f1c39e`).

Jeder Schritt ist eigenständig umsetzbar. Aufwand: **S** = < 1 h, **M** = 1–3 h, **L** = > 3 h.
Empfohlene Reihenfolge = Nummerierung; innerhalb einer Phase sind die Schritte unabhängig.

---

## Phase 1 — Datenkonsistenz auf DB-Ebene absichern (höchste Priorität)

### 1.1 Rechnungsstatus per Postgres-Trigger ableiten (M) — ✅ umgesetzt 05.07.2026
Der Status (`paid` / `partially_paid`) wird aktuell im Client berechnet
(`recalculateInvoiceStatus` in `src/hooks/useInvoicePayments.ts`). Bei zwei
gleichzeitigen Nutzern oder abgebrochenen Requests kann der Status von den
Zahlungen abweichen.
**Umsetzung:** Migration mit Trigger auf `invoice_payments`
(INSERT/UPDATE/DELETE), der `invoices.status`, `is_paid`, `payment_date`,
`paid_by_profile_id` neu berechnet. Danach Client-Logik auf reines Refetch
reduzieren.
**Status:** Migration `20260705140000_invoice_status_trigger.sql` — am
05.07.2026 manuell im SQL-Editor angewendet und verifiziert (Trigger + Index
vorhanden). Client-Recalc (`recalculateInvoiceStatus`/`deriveStatus`) aus
`useInvoicePayments.ts` entfernt; die DB ist alleinige Instanz für den Status.

### 1.2 Duplikat-Schutz für Rechnungen (S) — ✅ umgesetzt 05.07.2026
Es gibt keinen Schutz gegen doppelt angelegte Rechnungen (z. B. Dokument
zweimal hochgeladen und „Trotzdem hochladen" gewählt).
**Umsetzung:** Partieller Unique-Index auf
`(household_id, company_name, invoice_number) WHERE invoice_number IS NOT NULL`
+ verständliche Fehlermeldung im UI; zusätzlich Warnhinweis im Upload-Dialog,
wenn Firma+Betrag+Datum bereits existieren.
**Status:** Migration `20260705140100_invoice_duplicate_guard.sql` (Index wird
bei Bestandsduplikaten mit NOTICE übersprungen — dann erst Duplikate mergen),
23505-Handling in `useInvoices`, Live-Duplikatwarnung im Upload-Dialog.

### 1.3 Firmen-Matching präzisieren + Dubletten bereinigen (M) — ✅ umgesetzt 05.07.2026
`findOrCreateByName` (in `src/hooks/useContractors.ts`) matcht per Substring in
beide Richtungen — „Schmidmaier" matcht sowohl „Architekt Schmidmaier" als
auch „Bauunternehmen Schmidmaier GmbH"; der erste Treffer gewinnt. Das ist die
wahrscheinlichste Ursache der beobachteten Firmen-Inkonsistenz.
**Umsetzung:** (a) Exakter case-insensitiver Match zuerst, Substring nur als
Zweitstufe mit Mindestlänge (≥ 5 Zeichen) und eindeutigem Treffer, sonst neue
Firma anlegen. (b) Einmalige UI-Funktion „Firmen zusammenführen" auf der
Contractors-Seite für bestehende Dubletten.
**Status:** `matchContractorByName` (pure, mit Tests) + „Zusammenführen"-Dialog
auf der Firmen-Seite (hängt documents/offers/construction_journal um).

### 1.4 Legacy-Felder ausmustern (L, erst nach 1.1)
`invoices.is_paid` / `payment_date` / `paid_by_profile_id` und die Tabelle
`invoice_splits` sind nur noch Fallback für Altdaten.
**Umsetzung:** Datenmigration: für alle Alt-Rechnungen mit Splits, aber ohne
Payments, entsprechende `invoice_payments`-Zeilen erzeugen; danach
Fallback-Zweige in `getEffectivePayerAmounts`, Export und Comparison entfernen.
Erst ausführen, wenn 1.1 live ist.

---

## Phase 2 — ZIP-Upload gleichziehen

### 2.1 Gemeinsame Analyse-Logik extrahieren (M)
`src/pages/Documents.tsx` und `src/components/ZipUploadDialog.tsx` duplizieren
die komplette Datei-Analyse (Text-Extraktion je Dateityp + Edge-Function-Call).
**Umsetzung:** `src/utils/analyzeFile.ts` mit
`analyzeFile(file): Promise<AiResult | null>`; beide Stellen umstellen.

### 2.2 ZIP-Upload erstellt Rechnungen (M, nach 2.1)
Der ZIP-Upload legt nie Rechnungen an — erkannte Rechnungen landen als bloße
Dokumente. Seit dem Workflow-Umbau zeigt die Liste zwar „Rechnung fehlt", aber
der Nutzer muss jede einzeln nacharbeiten.
**Umsetzung:** Im ZIP-Flow bei `document_type === 'Rechnung'` und vollständigen
Daten die Rechnung direkt anlegen (gleiche Logik wie Einzelupload); bei
unvollständigen Daten bewusst nur das Badge stehen lassen. Ergebnisübersicht am
Ende: „X Rechnungen angelegt, Y unvollständig".

---

## Phase 3 — Code-Qualität & Wartbarkeit

### 3.1 Große Seiten in Komponenten aufteilen (L) — 🔶 teilweise umgesetzt 05.07.2026
`Documents.tsx` (~1.000 Zeilen) und `Invoices.tsx` (~950 Zeilen) sind schwer
wartbar.
**Umsetzung:** Extrahieren nach `src/components/documents/`
(UploadDialog, DocumentFormFields, DocumentTable) und `src/components/invoices/`
(InvoiceEditDialog, PaymentsEditor, PayDialog, AllocationEditor,
InvoiceStatsCards). Reine Verschiebung, kein Verhalten ändern — danach ist
jeder weitere Schritt billiger.
**Status:** Extrahiert: InvoiceStatsCards, PaymentDistributionChart,
PaymentsEditor (invoices/), InvoiceFieldsSection (documents/).
Invoices.tsx ~1000→739 Zeilen, Documents.tsx ~1080→910.
**Offen:** DocumentsTable, UploadDialog, InvoiceEditDialog, PayDialog,
AllocationEditor — die Dialoge hängen stark am Seiten-State und lohnen einen
eigenen Durchgang.

### 3.2 Restliche Lint-Fehler beheben + CI (S) — ✅ umgesetzt 05.07.2026
`npx eslint .` hat noch Altlasten (v. a. `no-explicit-any` in
`excelExport.ts`, `useDocuments.ts`, `Export.tsx`).
**Umsetzung:** Fehler beheben; GitHub Action mit `eslint + tsc --noEmit +
vitest run` bei jedem Push (verhindert Regressionen, auch durch Lovable-Edits).
**Status:** Alle 68 Fehler behoben (0 verbleibend); `.github/workflows/ci.yml`
mit Lint/Typecheck/Tests/Build. supabase/functions (Deno) vom Web-Lint
ausgenommen.

### 3.3 Tote Edge Function `analyze-invoice` entscheiden (S) — ✅ umgesetzt 05.07.2026
Wird nirgends aufgerufen.
**Umsetzung:** Entweder löschen oder als gezielten Zweitpass für
„Rechnung fehlt"-Dokumente einsetzen (Button „Rechnungsdaten per KI ergänzen"
im Dialog). Empfehlung: Zweitpass — löst genau den Fall unvollständiger
Extraktion.
**Status:** Als Zweitpass umgesetzt: „Per KI ergänzen"-Button in den
Rechnungsfeldern (Upload- und Bearbeiten-Dialog) füllt nur LEERE Felder.
Function erweitert (Bilder, 5MB, Brutto/DE-Zahlenformat-Prompt).
**Prüfen:** ob Lovable die Function-Änderung nach Push deployed hat
(Button einmal ausprobieren).

---

## Phase 4 — Performance

### 4.1 Bundle verkleinern / Code-Splitting (M)
Der JS-Bundle ist 2,2 MB (gzip 647 kB); recharts, xlsx, pdfjs und jszip werden
immer geladen.
**Umsetzung:** Route-basiertes `React.lazy()` für alle Seiten;
`import()` für xlsx (nur Export), pdfjs (nur Upload/Analyse), jszip (nur
ZIP-Upload); `build.rollupOptions.output.manualChunks` für vendor-Split.

### 4.2 Datenladen auf React Query umstellen (L)
Fast alle Hooks (`useInvoices`, `useDocuments`, …) laden per useState/useEffect
alles neu — jede Mutation triggert Voll-Refetches, jede Seite lädt beim
Mount alles. `useProfiles` nutzt bereits React Query (Vorbild).
**Umsetzung:** Hook für Hook umstellen (`useQuery` + `useMutation` mit
`invalidateQueries`); beginnen mit `useInvoices` + `useInvoicePayments`.

---

## Phase 5 — UX-Verbesserungen

### 5.1 Rechnungsliste: Suche, Filter, Sortierung (M)
Die Rechnungstabelle hat weder Suche noch Filter (Dokumente haben beides).
**Umsetzung:** Suchfeld (Firma/Nummer/Beschreibung), Filter für Status und
Kostengruppe, sortierbare Spalten (Datum, Betrag), optional Zeitraumfilter.

### 5.2 Saldo pro Person — „Wer schuldet wem?" (M)
Die Zahlungsverteilung zeigt, wer wieviel gezahlt hat, aber nicht den
Ausgleichssaldo bei ungleicher Verteilung.
**Umsetzung:** Karte auf Dashboard/Rechnungsseite: Summe je Person, Abweichung
von der Soll-Quote (z. B. 50/50, konfigurierbar in Settings), daraus
Ausgleichsbetrag.

### 5.3 PDF-Inline-Vorschau (M)
Dokumente öffnen aktuell nur als Download/neuer Tab.
**Umsetzung:** Vorschau-Dialog mit `<iframe>` auf die signierte URL (PDFs und
Bilder); Button neben Download. Besonders nützlich beim Prüfen der
KI-erkannten Rechnungsdaten.

### 5.4 Mobile-Tauglichkeit der Tabellen (M)
Viele Spalten sind auf Mobile ausgeblendet (`hidden md:table-cell`), dadurch
fehlen dort zentrale Infos.
**Umsetzung:** Card-Layout statt Tabelle unter `md`-Breakpoint für Rechnungen
und Dokumente.

---

## Phase 6 — KI-Extraktion weiter verbessern

### 6.1 Tool-Calling statt Regex-JSON (S)
`analyze-document` parst die Antwort per Regex — Markdown-Codeblöcke o. ä.
können das brechen.
**Umsetzung:** Lovable AI Gateway mit `tools`/`tool_choice` (function calling)
aufrufen; das Schema erzwingt gültiges strukturiertes JSON.

### 6.2 KI-Rohergebnis speichern + anzeigen (S)
Fehlgeschlagene Extraktionen sind nicht nachvollziehbar.
**Umsetzung:** Spalte `documents.ai_raw_result jsonb`; im Bearbeiten-Dialog
aufklappbar anzeigen („Was hat die KI erkannt?").

### 6.3 Mehrseitige/gescannte PDFs (M)
Gescannte PDFs ohne Textlayer liefern leeren `textContent` → Analyse läuft ins
Leere.
**Umsetzung:** Wenn extrahierter Text < 100 Zeichen: erste Seite als Bild
rendern (pdfjs `page.render()` auf Canvas) und als `imageBase64` schicken.

---

## Phase 7 — Sicherheit & Betrieb

### 7.1 RLS-Review (S)
`fetchAllPayments` / `fetchAllSplits` selektieren ohne `household_id`-Filter
und verlassen sich allein auf Row Level Security.
**Umsetzung:** RLS-Policies aller Tabellen gegen die Migrationen prüfen
(insb. `invoice_payments`, `invoice_splits`, `documents`-Storage-Policies);
Client-seitige household-Filter als Defense-in-Depth ergänzen.

### 7.2 Automatisches Backup (M)
Backup existiert nur manuell (Export-Seite, ZIP).
**Umsetzung:** Supabase Scheduled Edge Function (pg_cron), die wöchentlich
einen Export in einen separaten Storage-Bucket legt; Aufbewahrung 8 Wochen.

---

## Bekannte Stolperfallen (für alle Schritte)

- `npm install` **und** der Vite-Dev-Server verändern lokal
  `supabase/functions/mcp/index.ts` (Lovable-MCP-Plugin). Vor jedem Commit:
  `git checkout -- supabase/functions/mcp/index.ts`, falls nicht bewusst geändert.
- Edge-Function-Änderungen werden erst nach Push via Lovable deployed.
- **Gepushte Migrationsdateien wendet Lovable NICHT automatisch an**
  (verifiziert 05.07.2026): Neue Dateien unter `supabase/migrations/` müssen
  zusätzlich manuell im Supabase SQL-Editor ausgeführt werden. Migrationen
  deshalb immer idempotent schreiben (CREATE OR REPLACE, DROP IF EXISTS,
  DO-Block mit Exception-Handling).
- Vor DB-Migrationen (Phase 1) ein Backup über die Export-Seite ziehen.
