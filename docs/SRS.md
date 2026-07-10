# SRS & App-Konzept — Hausbau-Tracker (baukosten)

Stand: 08.07.2026 · Ersteller: Claude (mit Bauherr Basti) · **Einstiegsdokument für neue Arbeits-Sessions.**
Ergänzend: `docs/OPTIMIERUNGSPLAN.md` (technisches Backlog, Historie), `docs/SECURITY_REVIEW.md` (RLS-Audit).
**Vor jeder Arbeit zuerst Abschnitt 8 (Arbeitsvereinbarungen) lesen.**

---

## 1. Vision & Persona

### 1.1 Produktvision

Private Bauherren behalten während des Hausbaus **die Kosten im Griff**, ohne Excel-Akrobatik:
Rechnung reinwerfen → App erkennt, ordnet zu, rechnet — der Bauherr sieht jederzeit
**„Wo stehen wir gegenüber Plan, wer hat was bezahlt, was kommt noch?"**

### 1.2 Persona: „Der private Bauherr"

- Paar baut ein EFH (2–3 Jahre Projektlaufzeit), finanziert aus **Eigenvermögen beider Partner + Bankkredit**
- Arbeitet mit einem **Architekten**, der Kostenberechnungen liefert (mehrere Versionen über die Zeit)
  und bei der Rechnungsprüfung kürzt (Skonto, Sicherheitseinbehalt, Baustrom-/Versicherungsanteile)
- Denkt in **Gewerken** („Erdarbeiten", „Elektro", „Küche"), NICHT in DIN-276-Codes
- Kernbedürfnisse in dieser Reihenfolge:
  1. **Kostenüberblick**: Was ist geplant, beauftragt, abgerechnet, bezahlt — pro Gewerk und gesamt
  2. **Zahlungsverhältnis dokumentieren**: Wer (Partner A, Partner B, Kredit) hat was bezahlt →
     Grundlage für spätere **Besitzverhältnisse**. Es gibt KEINEN Ausgleich zwischen Zahlern
     (kein „wer schuldet wem" — verifiziertes User-Feedback!)
  3. Belege geordnet ablegen und wiederfinden
- Nutzung: primär Desktop (abends am Schreibtisch), sekundär Handy (auf der Baustelle)

### 1.3 Referenz-Artefakt: das Architekten-Excel

Das Excel des Architekten ist der **Goldstandard des mentalen Modells** (Screenshot 08.07.2026).
Struktur pro **Gewerk-Zeile** (z. B. „Erdarbeiten", „Zimmererarbeiten", „Küche"):

| Spalte | Bedeutung |
|---|---|
| Kostenberechnung vom 02.03.2026 | Schätzung Version 2 (aktuelle) |
| Kostenberechnung vom 12.12.2025 | Schätzung Version 1 (ältere) |
| günstigste oder beauftragt | Angebots-/Auftragssumme (rot/grün gegen Schätzung eingefärbt; kursiv-grün = noch keine Angebote, Schätzwert angesetzt) |
| Abrechnung | tatsächlich abgerechnet (Summe der geprüften Rechnungen) |
| Firmen | beauftragte Firma |
| Skonto % / Skonto-Ersparnis | vereinbartes Skonto und realisierte Ersparnis |
| Bemerkung | Freitext („noch keine Angebote vorliegend") |

Gruppiert in Abschnitte mit Zwischensummen: „1. Bauwerk – Baukonstruktion" (≈ DIN 300),
„2. Bauwerk – technische Anlagen" (≈ DIN 400), …

**Achtung, bekannter Formelfehler im Excel (entdeckt 10.07.2026 beim R1.1-Import):** Die Zwischensumme
„günstigste oder beauftragt" der Baukonstruktion (665.322,45 € netto) lässt die Zeile Baustelleneinrichtung
(30.595,38 €) aus; korrekt wären 695.917,83 €. Auch „Gesamtkosten" ist entsprechend zu niedrig. Die App
summiert korrekt — Abweichungen zum Excel an dieser Stelle sind kein App-Fehler.

**Ziel der App: dieses Excel vollständig ersetzen** — gleiche Denke, aber automatisch gefüllt
aus den ohnehin erfassten Rechnungen, Angeboten und Abzügen.

---

## 2. User Stories (Status: ✅ erfüllt · 🔶 teilweise · ⬜ offen)

### Epic A — Rechnungen erfassen (Kern, funktioniert gut)

| # | Story | Prio | Status |
|---|---|---|---|
| A1 | Als Bauherr lade ich eine Rechnung (PDF/Foto/Scan) hoch und die App erkennt Firma, Betrag, Datum, Nummer automatisch — ich prüfe nur noch. | MUSS | ✅ (inkl. Scan-Fallback, KI-Zweitpass, Duplikatwarnung) |
| A2 | Als Bauherr lade ich viele Belege als ZIP hoch und erkannte Rechnungen werden automatisch angelegt. | MUSS | ✅ |
| A3 | Als Bauherr erfasse ich Abzüge der Rechnungsprüfung (Skonto, Sicherheitseinbehalt, Baustrom, BW-Versicherung) in % oder €, damit Rechnung und Überweisung übereinstimmen. | MUSS | ✅ |
| A4 | Als Bauherr sehe ich einbehaltene Sicherheitseinbehalte gesammelt („kann noch nachgefordert werden"). | MUSS | ✅ |
| A5 | Als Bauherr kann ich Gelöschtes 30 Tage wiederherstellen (Papierkorb) und werde vor destruktiven Aktionen gewarnt. | MUSS | ✅ |

### Epic B — Zahlungen & Besitzverhältnisse (Kern, funktioniert gut)

| # | Story | Prio | Status |
|---|---|---|---|
| B1 | Als Bauherr markiere ich eine Rechnung als bezahlt und teile die Zahlung auf Personen auf (inkl. „Kredit" als virtuelles Mitglied). | MUSS | ✅ |
| B2 | Als Bauherr sehe ich pro Person: Summe, Anteil in % und aufklappbar jede Rechnung mit Teilbetrag. | MUSS | ✅ (PaymentsByPersonCard) |
| B3 | Als Bauherr sehe ich die Zahlungsverteilung als Diagramm. | SOLL | ✅ |
| B4 | Als Kreditnehmer will ich die **Kreditrate in Zins (= Baukosten) und Tilgung (= Vermögensverschiebung Kredit→Person) aufteilen** und die Tilgung den Kreditnehmern zuordnen. | SOLL | ⬜ **Kredit-Modul, Konzept in 4.4** |

### Epic C — Budget & Soll/Ist (größte Schwachstelle → Redesign)

| # | Story | Prio | Status |
|---|---|---|---|
| C1 | Als Bauherr lege ich **Gewerke** an (Erdarbeiten, Elektro, Küche …), wie im Architekten-Excel. | MUSS | 🔶 (Datenmodell + Seed ✅ R1.1; UI/Assistent → R1.2) |
| C2 | Als Bauherr hinterlege ich pro Gewerk mehrere **Schätzversionen** („Kostenberechnung vom …") und sehe die aktuelle. | MUSS | 🔶 (trade_estimates ✅ R1.1 inkl. beider Excel-Versionen; UI fehlt) |
| C3 | Als Bauherr hinterlege ich pro Gewerk die **Auftragssumme** („günstigste oder beauftragt") und die Firma. | MUSS | 🔶 (awarded_amount/contractor_id am Gewerk ✅ R1.1; UI fehlt) |
| C4 | Als Bauherr ordne ich Rechnungen einem **Gewerk** zu (nicht einem DIN-Subcode) — die App schlägt es **über die Firma** vor (deterministisch, konsistent). | MUSS | ✅ (R1.3 10.07.2026: Upload/ZIP/Bearbeiten/Budget; KI-Fallback für unbekannte Firmen → R4) |
| C5 | Als Bauherr sehe ich das Excel als App-Ansicht: pro Gewerk Schätzung V1/V2 → beauftragt → abgerechnet → bezahlt, mit Ampelfarben und Abschnitts-Zwischensummen, die **garantiert korrekt aufsummieren**. | MUSS | 🔶 (Budget-Seite v1 ✅ 10.07.2026; Verifikation + Rückbau alter Seiten R1.6 offen) |
| C6 | Als Bauherr sehe ich die realisierte **Skonto-Ersparnis** pro Gewerk und gesamt (aus den erfassten Abzügen). | SOLL | ✅ (Skonto-Spalte auf Budget-Seite: realisiert aus Abzügen, sonst erwartet aus skonto_percent) |
| C7 | Als Bauherr importiere ich die Kostenberechnung des Architekten (Excel) als neue Schätzversion. | SOLL | 🔶 (KI-Import existiert für DIN-Positionen; auf Gewerke umstellen) |

### Epic D — Dokumente (funktioniert gut)

| # | Story | Prio | Status |
|---|---|---|---|
| D1 | Als Bauherr finde ich jeden Beleg über Suche/Filter und sehe ihn inline (PDF-Vorschau). | MUSS | ✅ |
| D2 | Als Bauherr sehe ich, was die KI erkannt hat (Nachvollziehbarkeit). | SOLL | ✅ (ai_raw_result) |

### Epic E — Übersicht & Bedienung

| # | Story | Prio | Status |
|---|---|---|---|
| E1 | Als Bauherr sehe ich auf dem Dashboard die 4–5 wichtigsten Zahlen: Budget gesamt, beauftragt, abgerechnet, bezahlt, Prognose-Abweichung. | MUSS | 🔶 (Dashboard existiert, auf Gewerke-Kennzahlen umstellen) |
| E2 | Als Bauherr habe ich eine **aufgeräumte Navigation** ohne tote Punkte. | MUSS | ⬜ Konzept 4.2 |
| E3 | Als Bauherr kann ich die App am Handy auf der Baustelle nutzen (Foto → Rechnung; Karten statt Tabellen). | SOLL | ⬜ (Plan 5.4) |
| E4 | Als Haushalt arbeiten wir zu zweit gleichzeitig ohne Datenverlust. | MUSS | ✅ (DB-Trigger, RLS) |

### Epic F — Betrieb & Sicherheit

| # | Story | Prio | Status |
|---|---|---|---|
| F1 | Daten sind pro Haushalt isoliert, IBAN besonders geschützt. | MUSS | ✅ (Audit: SECURITY_REVIEW.md) |
| F2 | Wöchentliches automatisches Daten-Backup + manuelles Voll-Backup (ZIP mit Dateien). | MUSS | ✅ (Migration 20260708110000) |
| F3 | CI prüft jeden Push (Lint, Typen, Tests, Build). | MUSS | ✅ |

---

## 3. Ist-Zustand (Kurzfassung)

### 3.1 Stack & Architektur

- **Frontend**: Vite + React 18 + TypeScript + shadcn/Tailwind, Route-Lazy-Loading (Initial 495 kB)
- **Backend**: Supabase via Lovable Cloud — Postgres (RLS überall), Storage (4 private Buckets),
  Edge Functions `analyze-document`, `analyze-invoice`, `analyze-estimate` (Gemini Flash via Lovable AI Gateway, Tool-Calling), `mcp`
- **Datenmodell-Kern**: `invoices` ←1:n— `invoice_payments` (einzige Zahlungsquelle),
  `invoice_deductions` (Abzüge; Zahlbetrag = Betrag − Abzüge), `invoice_allocations` (DIN-Zuordnung, → wird durch Gewerke ersetzt),
  `documents` (invoice_id-Verknüpfung; Rechnung ist Master), `contractors`, `backups`, Papierkorb via `deleted_at`
- **Status-Logik**: DB-Trigger `recalc_invoice_payment_status` (bezahlt = Zahlungen ≥ Zahlbetrag)
- 23 Unit-Tests (reine Logik), CI grün

### 3.2 Verifizierte Schwachstellen (User-Feedback 08.07.2026)

1. **DIN-276-Subcode-Zuordnung unzuverlässig**: KI vergibt bei derselben Rechnung mal 311, mal 313;
   Summen aggregieren nicht auf Elternknoten (100/300/400 …). Subcode-Granularität ist für die
   Persona wertlos — sie denkt in Gewerken. → **Ersatz durch Gewerke-Modell (4.1)**
2. **Soll/Ist unbrauchbar in der Praxis**: Vergleich läuft real über das Architekten-Excel.
   → **Gewerke-Ansicht = Excel-Ersatz (4.1/C5)**
3. **Navigation überladen**: 10 Punkte, davon mehrere kaum/nicht genutzt (Kostenschätzung,
   Angebote, Soll/Ist als getrennte Seiten; Bautagebuch unklar). → **IA-Konzept (4.2)**
4. **KI wirkt „unprofessionell"**: unklar wann sie was tut, keine Konfidenz, keine Lernschleife. → **(4.3)**

---

## 4. Soll-Konzept

### 4.1 KERNSTÜCK: Gewerke-basiertes Budget (ersetzt DIN-Subcodes + Soll/Ist + Angebote-Seite)

**Leitidee**: Das Gewerk (Budgetposten) wird die zentrale Entität — exakt die Zeile aus dem
Architekten-Excel. DIN 276 bleibt nur als grobe Abschnitts-Gruppierung (100–800) erhalten.

#### Datenmodell (neu)

```
trades (Gewerke)
  id, household_id, name ("Erdarbeiten"), section (100|200|300|400|500|600|700|800),
  contractor_id (beauftragte Firma, nullable), skonto_percent (erwartet, nullable),
  awarded_amount (beauftragt/günstigstes Angebot, nullable), awarded_note,
  sort_order, notes, deleted_at

trade_estimates (Schätzversionen je Gewerk)
  id, trade_id, version_label ("Kostenberechnung vom 02.03.2026"), estimate_date,
  amount, is_current (die neueste zählt für Soll/Ist)

invoices.trade_id (nullable FK)  ← ersetzt kostengruppe_code/invoice_allocations als primäre Zuordnung
```

- **Migration der Bestandsdaten**: bestehende `invoice_allocations`/`kostengruppe_code` → je
  belegtem 3-Steller ein Gewerk-Vorschlag generieren, den der Bauherr einmalig zusammenführt/umbenennt
  (UI-Assistent „Gewerke einrichten": Vorschlagsliste aus vorhandenen Zuordnungen + Excel-Import).
- Mehrfach-Zuordnung (eine Rechnung, mehrere Gewerke) bleibt als Ausnahme möglich
  (invoice_allocations bekommt trade_id statt kostengruppe_code) — Standard ist 1 Rechnung : 1 Gewerk.

#### Zuordnungs-Logik (löst das Konsistenzproblem)

1. **Deterministisch zuerst**: Firma der Rechnung → Gewerk mit dieser contractor_id
   (im Excel hat fast jedes Gewerk genau eine Firma). Gleiche Firma ⇒ immer gleiches Gewerk ⇒ konsistent.
2. Firma mit mehreren Gewerken → Auswahl-Dropdown (nur diese Gewerke).
3. Unbekannte Firma → KI schlägt Gewerk aus der Gewerkliste vor (geschlossene Liste statt
   offener DIN-Katalog ⇒ drastisch zuverlässiger), Bauherr bestätigt.
4. Summen aggregieren per Konstruktion korrekt: Gewerk → Abschnitt → Gesamt (keine Baum-Widersprüche mehr).

#### Budget-Ansicht (neue Hauptseite, ersetzt Kostenschätzung + Soll/Ist + Angebote)

Tabelle wie das Excel, live berechnet:

| Gewerk | Schätzung (aktuell) | Vorversion | Beauftragt | Abgerechnet | Bezahlt | Δ zu Schätzung | Skonto gespart | Status |
|---|---|---|---|---|---|---|---|---|

- Abgerechnet = Σ Zahlbeträge der zugeordneten Rechnungen · Bezahlt = Σ Zahlungen
- Ampel: Beauftragt/Abgerechnet vs. aktuelle Schätzung (grün/rot wie im Excel); „noch keine Angebote" = Schätzwert kursiv
- Status automatisch: `offen → beauftragt → in Abrechnung → abgerechnet` (abgeleitet, nicht gepflegt)
- Abschnitts-Zwischensummen (Baukonstruktion, Technische Anlagen, …) + Gesamtsumme + Prognose
  (Σ max(Schätzung, Beauftragt, Abgerechnet) je Gewerk = realistische Endkosten)
- Zeile aufklappbar: zugeordnete Rechnungen, Angebote/Notizen, Schätzhistorie
- **Excel-Import**: Architekten-Excel hochladen → KI mappt Zeilen auf bestehende Gewerke
  (Namensabgleich, Bestätigungsdialog) → neue Schätzversion für alle in einem Schritt

### 4.2 Navigation / Informationsarchitektur (neu)

Von 10 auf 6 Punkte; Zusammenlegung statt Streichung von Funktionalität:

| Neu | Enthält | Bisher |
|---|---|---|
| **Dashboard** | Kennzahlen (Budget/Beauftragt/Abgerechnet/Bezahlt/Prognose), Zahlungsverteilung, Sicherheitseinbehalte, letzte Aktivität | Dashboard |
| **Budget** | Gewerke-Tabelle (4.1) inkl. Schätzversionen, Angebots-/Auftragssummen, Excel-Import | Kostenschätzung + Soll/Ist + Angebote |
| **Rechnungen** | Liste, Zahlungen, Abzüge, Papierkorb | Rechnungen |
| **Dokumente** | Upload/ZIP, Vorschau, Suche | Dokumente |
| ~~Bautagebuch~~ | **entfernt 08.07.2026 (OF-1: nicht genutzt)** — Seite/Route/Hook gelöscht; DB-Tabelle `construction_journal`, Storage-Bucket und Backup-Abdeckung bleiben (Alt-Daten erhalten, Reaktivierung möglich) | Bautagebuch |
| **Einstellungen** | Haushalt & Mitglieder, **Firmen**, **Export & Sicherung**, Kredit (später) | Einstellungen + Firmen + Export |

- Firmen und Export sind Verwaltungs-, keine Alltagsthemen → unter Einstellungen (als Tabs/Unterpunkte)
- Modern: schlankere Sidebar mit Gruppierung (oben Alltag, unten Zahnrad), aktive Route klar,
  mobile: Bottom-Navigation mit den 4 Alltagspunkten (→ zusammen mit 5.4 Mobile)

### 4.3 KI-Konzept „professionell" (im Rahmen von Lovable machbar)

Bereits umgesetzt: Tool-Calling (strukturierte Extraktion), Zweitpass für Rechnungsfelder,
Scan-Fallback (Seiten als Bild), Rohergebnis am Dokument, DE-Zahlformat-Prompts.

Ausbaustufen (alle mit Lovable AI Gateway möglich):

1. **KI nur wo sie stark ist**: Extraktion aus Dokumenten ja — Klassifikation ins Budget nein
   (übernimmt die deterministische Firma→Gewerk-Regel, 4.1). Weniger KI = konsistenter.
2. **Konfidenz & Review-Queue**: Extraktion liefert pro Feld Konfidenz (Tool-Schema erweitern);
   unter Schwelle → Rechnung startet im Status `review_needed` (existiert schon) statt still
   falsch. Dashboard-Hinweis „2 Rechnungen zu prüfen".
3. **Lernschleife light**: Korrekturen des Bauherrn werden gespeichert (ai_raw_result vs. finale
   Werte existiert schon) → häufige Firmen bekommen Extraktionshinweise als Few-Shot-Beispiele
   in den Prompt („Bei Fa. Mayerbau steht der Bruttobetrag unter ‚Gesamtsumme inkl. USt'").
4. **Modell-Stufen**: Standard Gemini Flash (billig); bei niedriger Konfidenz oder Nutzer-Klick
   automatische Eskalation auf Gemini Pro (Gateway unterstützt Modellwahl pro Request).
5. **Messbarkeit**: kleines Eval-Skript über gespeicherte ai_raw_result/Endwerte → Erkennungsquote
   pro Feld, bevor/nachdem Prompts geändert werden.

### 4.4 Kredit-Modul (Phase 3)

```
loans: id, household_id, name, bank, principal, interest_rate_percent, start_date, notes
loan_shares: loan_id, profile_id, share_percent          (Kreditnehmer-Anteile)
loan_payments: id, loan_id, payment_date, total_amount,
               interest_amount (Zinsen), principal_amount (Tilgung), notes
```

- **Zinsen** = echte Baukosten → automatisch als Kosten im Gewerk „Finanzierung" (Abschnitt 800)
- **Tilgung** = keine Kosten, sondern Vermögensverschiebung: reduziert den „Kredit"-Anteil und
  erhöht die Anteile der Kreditnehmer gemäß loan_shares → fließt in die Besitzverhältnis-Ansicht
  (PaymentsByPersonCard bekommt eine zweite Ebene: „ursprünglich gezahlt" vs. „nach Tilgung")
- Erfassung: monatliche Rate manuell oder als wiederkehrende Vorlage; Zins/Tilgung-Split aus dem
  Tilgungsplan (Import als CSV/Excel möglich, KI-Extraktion aus Bank-PDF denkbar)
- Das virtuelle Haushaltsmitglied „Kredit" bleibt der Zahler auf Rechnungsebene — das Modul
  verteilt dessen Topf nachträglich auf die Kreditnehmer

---

## 5. Nicht-funktionale Anforderungen

| Bereich | Anforderung | Stand |
|---|---|---|
| Sicherheit | RLS pro Haushalt auf allen Tabellen/Buckets; IBAN spaltengeschützt | ✅ auditiert |
| Datensicherheit | Papierkorb 30 Tage; wöchentl. Auto-Backup (8 Stände) + manuelles ZIP | ✅ |
| Konsistenz | Zahlungs-/Statuslogik ausschließlich in DB (Trigger); Summen per Konstruktion korrekt | ✅ / Gewerke ⬜ |
| Performance | Initial-Bundle < 500 kB; Seitenwechsel ohne Voll-Refetch (→ 4.2 React Query offen) | 🔶 |
| Qualität | CI (Lint/Typecheck/Tests/Build) auf jedem Push; reine Logik unit-getestet | ✅ |
| Mobile | Kernflüsse (Foto-Upload, Rechnungsliste, Budget lesen) am Handy nutzbar | ⬜ |

---

## 6. Priorisierter Umsetzungsplan

**R1 — Budget/Gewerke (Kern-Redesign, mehrere Sessions)**
1. R1.1 Datenmodell: trades + trade_estimates + invoices.trade_id (Migration, idempotent) — ✅ 10.07.2026
   (Migration `20260708130000_trades_gewerke_model.sql` vom Bauherrn ausgeführt; 28 Gewerke + 2 Schätzversionen
   + Auftragssummen/Firmen/Skonti aus dem Architekten-Excel geseedet — Seed-SQL bewusst nicht im Git, private Daten.
   Netto/Brutto: trades/trade_estimates tragen tax_status wie architect_estimate_items, Werte netto wie im Excel.)
2. R1.2 Einrichtungs-Assistent — ✅ obsolet/erledigt 10.07.2026: Gewerke kamen vollständig aus dem
   Excel-Seed (R1.1); der verbliebene Rest (Bestandsrechnungen zuordnen) ist auf der Budget-Seite
   umgesetzt („Rechnungen ohne Gewerk": Auto-Zuordnung über Firma→Gewerk-Regel + manuelles Dropdown)
3. R1.3 Zuordnung: Firma→Gewerk-Regel im Upload-/Bearbeiten-Flow — ✅ 10.07.2026:
   `suggestTradeForCompany` (useTrades.ts, unit-getestet) + `TradeSelect` (geschlossene Gewerkliste,
   nach Abschnitten gruppiert). Angewendet in: Upload-Dialog (ersetzt dort das DIN-Feld; DIN-Code aus
   der KI wird weiter still gespeichert), ZIP-Auto-Anlage, Rechnungs-Bearbeiten-Dialog (Gewerk-Feld,
   Vorschlag beim Öffnen) und Budget-Auto-Zuordnung. Nur eindeutige Firma→Gewerk-Treffer werden
   automatisch gesetzt. **KI-Vorschlag für unbekannte Firmen bewusst zurückgestellt** (alle Gewerke
   haben Firmen aus dem Seed; bei Bedarf in R4 mit Konfidenz/Review-Queue umsetzen)
4. R1.4 Budget-Seite (Excel-Ansicht) mit Abschnitts-Summen, Ampeln, Prognose, aufklappbaren Zeilen —
   ✅ v1 10.07.2026 (src/pages/Budget.tsx, Route /budget): Brutto/Netto-Umschalter, Beauftragt mit
   kursivem Schätzwert-Ansatz, Status abgeleitet (offen→beauftragt→in Abrechnung→abgerechnet),
   Skonto-Spalte (realisiert, sonst ~erwartet), Kennzahlen-Karten inkl. Prognose. Verifikation durch
   Bauherrn ausstehend; Gewerk-Bearbeiten-UI (Auftragssumme/Firma/Skonto ändern) noch offen
5. R1.5 Excel-Import der Architekten-Kostenberechnung als Schätzversion
6. R1.6 Rückbau: Kostenschätzung-/Soll-Ist-/Angebote-Seiten in Budget aufgehen lassen; DIN-Subcode-Felder ausblenden (Daten behalten)

**R2 — Navigation & Dashboard**
7. R2.1 Sidebar neu (6 Punkte, Gruppierung), Firmen/Export unter Einstellungen
8. R2.2 Dashboard auf Budget-Kennzahlen umstellen (E1) + „zu prüfen"-Hinweis
9. R2.3 Mobile: Bottom-Nav + Karten-Layouts (alt 5.4)

**R3 — Kredit-Modul (4.4)**

**R4 — KI-Ausbau (4.3):** Konfidenz/Review-Queue → Few-Shot-Hinweise → Modell-Eskalation → Eval

**R5 — Technik-Rest:** React Query (alt 4.2), Dialog-Extraktion (alt 3.1-Rest), Node-24-Bump der CI

### Offene Fragen an den Bauherrn (zu Beginn der nächsten Session klären)

Alle beantwortet am 08.07.2026:

- ~~OF-1~~: ✅ Bautagebuch nicht genutzt → aus App entfernt (Daten bleiben in DB/Backup)
- ~~OF-2~~: ✅ Bauphasen-Kontext: Es gibt pro Gewerk eine (schwierige) **Angebotsphase**, aber der
  Haushalt ist bereits in der **Umsetzungsphase** → für R1 reicht die **Auftragssumme am Gewerk**
  („beauftragt"). Ein Angebotsvergleichs-Modul (mehrere Angebote je Gewerk, Vergleich, Zuschlag)
  ist als **späteres Feature** im Backlog (nach R3/R4) — relevant für künftige Bauherren-Nutzer
  bzw. Restgewerke, nicht jetzt. Bestehende Angebote-Seite geht wie geplant in Budget auf.
- ~~OF-3~~: ✅ Gewerkliste initial aus dem Architekten-Excel: liegt lokal unter
  `C:\Projekte\baukosten\Kostenverfolgung-Oberanger10.xlsx` (**absichtlich NICHT im Git** —
  private Daten, *.xlsx ist gitignored; Repo synct zu Lovable). Struktur siehe 1.3. R1.2 nutzt
  diese Datei als Quelle für Gewerke, Schätzversionen (02.03.2026 + 12.12.2025), Auftragssummen,
  Firmen und Skonto-Sätze.
- ~~OF-4~~: ✅ Kredit-Details „später" → R3 bleibt hinten, keine Vorarbeiten nötig.

---

## 7. Glossar

| Begriff | Bedeutung |
|---|---|
| Gewerk | Budgetposten/Zeile im Architekten-Excel (= trade); trägt Schätzungen, Auftragssumme, Firma |
| Abschnitt | Grobe DIN-276-Gruppe (100–800) zur Gruppierung der Gewerke |
| Zahlbetrag | Rechnungsbetrag − Abzüge (Skonto, Einbehalte, …); Maßstab für „bezahlt" |
| Sicherheitseinbehalt | Einbehaltener Betrag, ggf. nach Gewährleistung fällig |
| „Kredit" | Virtuelles Haushaltsmitglied als Zahler; Zahlungsverhältnis dokumentiert Besitzverhältnisse |
| Prognose | Σ je Gewerk max(Schätzung, Beauftragt, Abgerechnet) — realistische Endkosten |

---

## 8. Arbeitsvereinbarungen (für jede Session verbindlich)

1. **`git pull` vor jeder Arbeit** — Lovable pusht selbst Commits.
2. **Migrationen wendet Lovable NICHT an**: SQL immer als Copy-Paste-Block liefern (idempotent:
   IF NOT EXISTS / OR REPLACE / DO-Blöcke). **Reihenfolge: Migration liefern → Bauherr bestätigt →
   erst dann Client-Code pushen, der neue Spalten/Tabellen LIEST** (sonst bricht die App im Zwischenfenster).
   Alternativ defensiv coden (Feature blendet sich bei fehlender Tabelle aus).
3. **Edge Functions**: Nach Code-Push einen Lovable-Prompt zum Redeploy mitliefern
   („Redeploy the edge function X from the current repository code. Do not change any code.").
4. **Doppelte Lockfiles**: Ändert eine Seite package.json → beide Lockfiles nachziehen
   (lokal `npm install`; Lovable pflegt bun.lock). Sonst bricht CI (`npm ci`) oder Lovable-Build.
5. `supabase/functions/mcp/index.ts` wird von npm install/vite lokal verstümmelt →
   vor Commits `git checkout -- supabase/functions/mcp/index.ts`.
6. Generierte `src/integrations/supabase/types.ts` bei neuen Tabellen/Spalten manuell nachziehen.
7. Vor jedem Push: `tsc --noEmit`, `eslint . --quiet`, `vitest run`, `npm run build` — alles grün.
8. Fachregeln: **kein Settlement/„wer schuldet wem"** (Zahlungsverhältnis = Besitzverhältnisse);
   invoice_payments ist die einzige Zahlungsquelle; Rechnung ist Master für Rechnungs-Dokumente.
9. Statuspflege: Erledigtes in diesem SRS (Story-Status) und im OPTIMIERUNGSPLAN abhaken;
   Projekt-Memory aktualisieren.
