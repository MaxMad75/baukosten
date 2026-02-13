

# Kostenschaetzung: Dokument-Auswahl, OCR-Fallback und KI-Vorab-Analyse

## Zusammenfassung

Drei Verbesserungen fuer die Kostenschaetzungs-Seite:

1. **PDF-Upload reparieren**: Gescannte PDFs (Bilder statt Text) werden aktuell nicht erkannt. Loesung: Wenn die Text-Extraktion wenig Text liefert, wird das PDF als Base64 an die KI geschickt (Vision/OCR-Fallback).

2. **Bereits hochgeladene Dokumente auswaehlen**: Neben dem PDF-Upload kann der Nutzer aus der bestehenden Dokumentenbibliothek ein Dokument waehlen und dieses als Kostenschaetzung analysieren lassen.

3. **KI-Vorab-Analyse**: Bevor Kosten extrahiert werden, prueft die KI zuerst ob das Dokument ueberhaupt eine Kostenschaetzung ist. Falls ja, werden die Kosten strukturiert extrahiert und nach DIN 276 aufbereitet. Falls nein, bekommt der Nutzer eine klare Meldung.

## Was sich aendert

### 1. Edge Function `analyze-estimate` ueberarbeiten

**Problem**: Die Funktion erwartet reinen Text (`pdfContent`), was bei gescannten PDFs leer ist. Ausserdem fehlt sie in `config.toml`.

**Loesung**:
- Akzeptiert jetzt sowohl `textContent` (extrahierter Text) als auch `fileBase64` (Base64 des PDFs fuer Vision-Analyse)
- Zweistufiger KI-Prompt:
  - Schritt 1: "Ist das eine Kostenschaetzung?" -> `is_estimate: true/false` mit Begruendung
  - Schritt 2 (nur wenn ja): Kosten nach DIN 276 extrahieren
- In `config.toml` eintragen mit `verify_jwt = false`

### 2. Estimates-Seite (`src/pages/Estimates.tsx`) erweitern

**Neuer "Aus Dokumenten waehlen"-Button** neben PDF-Upload und manueller Eingabe:
- Oeffnet einen Dialog mit Liste aller hochgeladenen Dokumente
- Suchfeld zum Filtern nach Name
- Auswahl eines Dokuments -> Datei wird aus dem Storage geladen
- Text wird extrahiert (mit OCR-Fallback)
- An `analyze-estimate` geschickt
- Ergebnisse werden wie bisher in der Tabelle angezeigt

**Upload-Flow verbessert**:
- Bei PDF-Upload: Text extrahieren, wenn zu wenig Text -> Base64 an Edge Function schicken
- KI-Vorab-Analyse zeigt dem Nutzer an: "Dies scheint [keine] Kostenschaetzung zu sein"
- Bei positiver Erkennung: Kosten-Tabelle wie gehabt anzeigen
- Bei negativer Erkennung: Hinweis mit Option trotzdem fortzufahren

### 3. Dokument-Auswahl-Dialog (neues Component)

Neues Component `EstimateDocumentPicker.tsx`:
- Zeigt Dokumente aus `useDocuments()` als filterbare Liste
- Zeigt Dateiname, Typ, Datum
- "Analysieren"-Button pro Dokument
- Laedt die Datei via signedUrl aus dem Storage

## Technische Details

### Edge Function Aenderungen

```text
analyze-estimate/index.ts:
  Input:  { textContent?: string, fileBase64?: string, fileName: string }
  Output: {
    is_estimate: boolean,
    confidence: string,  // "hoch", "mittel", "niedrig"
    reason: string,      // Begruendung
    items?: [{ kostengruppe_code, estimated_amount, notes }],
    total?: number
  }
```

Die KI bekommt einen kombinierten Prompt der beides macht: Erkennung und Extraktion.
Bei `fileBase64` wird das Bild als multimodal content (image_url) an die KI geschickt.

### config.toml Ergaenzung

```text
[functions.analyze-estimate]
verify_jwt = false
```

### Frontend-Flow

```text
Nutzer waehlt Quelle:
  A) PDF hochladen -> extractTextFromPDF()
     -> wenig Text? -> file.arrayBuffer() -> Base64
     -> viel Text? -> textContent verwenden
  B) Dokument auswaehlen -> signedUrl laden -> fetch -> gleiche Logik

-> Edge Function aufrufen mit textContent ODER fileBase64
-> Antwort: is_estimate?
   Ja -> Kosten-Tabelle anzeigen, bearbeiten, speichern
   Nein -> Warnung: "Kein Kostenschaetzungs-Dokument erkannt. [Grund]. Trotzdem analysieren?"
```

### Aenderungen an bestehenden Dateien

| Datei | Aenderung |
|-------|-----------|
| `supabase/functions/analyze-estimate/index.ts` | Komplett ueberarbeitet: Vision-Support, Vorab-Analyse, neues Input/Output-Format |
| `supabase/config.toml` | Wird automatisch aktualisiert |
| `src/pages/Estimates.tsx` | Neuer "Aus Dokumenten"-Button, OCR-Fallback-Logik, Vorab-Analyse-Anzeige |
| `src/components/EstimateDocumentPicker.tsx` | Neu: Dialog zur Dokument-Auswahl |

