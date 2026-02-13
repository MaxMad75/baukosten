

# KI-Analyse fuer alle Dateitypen mit Analyse-Status und Re-Analyse

## Zusammenfassung

Alle Dokumenttypen (nicht nur PDFs) werden per KI analysierbar. In der Dokumentliste ist auf einen Blick erkennbar, welche Dateien bereits analysiert wurden. Per Klick kann eine (erneute) Analyse gestartet werden.

## Was sich aendert

### 1. Erweiterte KI-Analyse fuer alle Dateitypen

| Dateityp | Methode |
|----------|---------|
| PDF | Textextraktion im Browser, dann KI-Analyse (wie bisher) |
| JPG/JPEG/PNG | Bild als Base64 an KI senden (Gemini Vision) |
| DOCX/DOC | Dateiname-basierte Analyse (eingeschraenkt, da kein Textextractor vorhanden) |
| XLSX/XLS | Tabelleninhalt per xlsx-Bibliothek extrahieren, dann KI-Analyse |

### 2. Edge Function erweitern (`analyze-document`)

Die bestehende Funktion wird erweitert, sodass sie neben `textContent` auch `imageBase64` akzeptiert. Bei Bildern wird Geminis multimodales Modell genutzt, um den Bildinhalt zu analysieren. Der Prompt bleibt gleich - Titel, Typ, Beschreibung und Firmenname werden extrahiert.

### 3. Client-seitige Textextraktion fuer XLSX

Eine neue Hilfsfunktion `extractTextFromExcel` in `src/utils/excelExtractor.ts` nutzt die bereits installierte `xlsx`-Bibliothek, um Tabelleninhalte als Text zu extrahieren.

### 4. Analyse-Status in der Dokumentliste

In der Tabelle auf der Dokumentseite wird sichtbar gemacht:
- Goldenes Sparkles-Icon: bereits KI-analysiert
- Graues Sparkles-Icon mit Fragezeichen: noch nicht analysiert
- Ein Analyse-Button (Sparkles + Play) pro Dokument zum Starten/Wiederholen der Analyse

### 5. Batch-Analyse und Re-Analyse

- Einzelne Dokumente koennen ueber einen Button in der Aktionsspalte analysiert oder erneut analysiert werden
- Waehrend der Analyse wird ein Ladeindikator angezeigt
- Nach erfolgreicher Analyse werden Titel, Typ, Beschreibung und Firma automatisch aktualisiert

## Technische Details

### Edge Function Aenderungen (`supabase/functions/analyze-document/index.ts`)

- Neues optionales Feld `imageBase64` im Request Body
- Wenn `imageBase64` vorhanden: multimodaler Request mit `image_url` Content-Part an Gemini
- Wenn `textContent` vorhanden: wie bisher Text-Analyse
- Mindestens eines der beiden Felder muss gesetzt sein

### Neue Datei: `src/utils/excelExtractor.ts`

- Nutzt die bereits vorhandene `xlsx`-Bibliothek
- Liest alle Sheets aus und konvertiert sie in lesbaren Text

### Neue Hilfsfunktion: `src/utils/imageToBase64.ts`

- Konvertiert eine File-Instanz in einen Base64-String fuer die Uebertragung an die Edge Function

### Aenderungen an `src/pages/Documents.tsx`

- Neuer Analyse-Button pro Zeile (Sparkles-Icon)
- Tooltip zeigt "KI-Analyse starten" oder "Erneut analysieren"
- Analyse-Funktion `handleAnalyze(doc)`:
  1. Datei aus Storage herunterladen (signierte URL)
  2. Je nach Dateityp: Text extrahieren oder Base64 erzeugen
  3. Edge Function aufrufen
  4. Dokument-Metadaten mit KI-Ergebnis aktualisieren
- Ladeindikator waehrend der Analyse (Spinner ersetzt Sparkles-Icon)
- Visueller Unterschied zwischen analysierten und nicht-analysierten Dokumenten

### Aenderungen an `src/components/ZipUploadDialog.tsx`

- KI-Analyse wird auf alle unterstuetzten Dateitypen erweitert (nicht nur PDFs)
- Bilder werden als Base64, Excel als Text an die Edge Function gesendet

