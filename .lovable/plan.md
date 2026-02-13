
# ZIP-Upload mit automatischer Entpackung und KI-Analyse

## Zusammenfassung

ZIP-Dateien werden im Browser entpackt und jede enthaltene Datei einzeln hochgeladen und (bei PDFs) per KI analysiert. Das ist machbar, braucht aber eine durchdachte Umsetzung.

## Einschraenkungen und Risiken

- **KI-Analyse nur fuer PDFs**: Bilder, Word- und Excel-Dateien werden hochgeladen aber nicht KI-analysiert (wie bisher)
- **Grosse ZIPs**: Bei vielen Dateien (z.B. 50+) dauert der Upload und die KI-Analyse laenger -- ein Fortschrittsbalken zeigt den Status
- **Verschachtelte ZIPs**: ZIPs in ZIPs werden nicht entpackt (nur eine Ebene)
- **Maximale Dateigroesse**: ZIPs bis 50 MB, Einzeldateien innerhalb bis 20 MB

## Ablauf

```text
ZIP hochladen
    |
    v
Browser entpackt ZIP (JSZip)
    |
    v
Dateiliste mit Ordnerstruktur anzeigen
    |
    v
User kann Dateien abwaehlen / Typ zuweisen
    |
    v
Dateien einzeln hochladen + PDFs per KI analysieren
    |
    v
Fortschrittsanzeige (3/12 Dateien verarbeitet...)
    |
    v
Ergebnis-Uebersicht mit Status pro Datei
```

## Technische Umsetzung

### 1. Abhaengigkeit: JSZip installieren
- `jszip` Paket hinzufuegen fuer clientseitiges Entpacken

### 2. Neuer Utility: `src/utils/zipExtractor.ts`
- ZIP-Datei im Browser entpacken
- Ordnerstruktur auslesen
- Unterstuetzte Dateitypen filtern (PDF, DOC, DOCX, JPG, PNG, XLSX)
- Maximale Dateigroesse pro Datei pruefen

### 3. Erweiterung: `src/pages/Documents.tsx`
- ZIP als akzeptierten Dateityp hinzufuegen
- Bei ZIP-Upload: Dateiliste mit Ordnernamen anzeigen
- Fortschrittsbalken waehrend Batch-Upload
- Checkbox pro Datei zum Ab-/Anwaehlen
- Batch-Verarbeitung: Dateien sequenziell hochladen und analysieren
- Ergebnis-Dialog: Uebersicht welche Dateien erfolgreich waren

### 4. Erweiterung: `src/hooks/useDocuments.ts`
- Neue Funktion `uploadBatch` fuer mehrere Dateien gleichzeitig
- Callback fuer Fortschritts-Updates
- Fehlerbehandlung pro Datei (eine fehlgeschlagene Datei stoppt nicht den Rest)

### Kein Backend-Aenderung noetig
- Storage-Bucket und Datenbank-Tabelle bleiben unveraendert
- Edge Function bleibt unveraendert (wird pro PDF einzeln aufgerufen)
