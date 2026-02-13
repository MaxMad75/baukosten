
# Duplikaterkennung per File-Hash

## Zusammenfassung

Jede hochgeladene Datei erhaelt einen SHA-256-Hash, der in der Datenbank gespeichert wird. Vor dem Upload wird geprueft, ob der Hash bereits existiert. Dies funktioniert sowohl bei Einzel-Uploads als auch bei Dateien aus ZIP-Archiven.

## Was sich aendert

### 1. Datenbank: Neue Spalte `file_hash`

Eine neue Spalte `file_hash` (TEXT, nullable) wird zur `documents`-Tabelle hinzugefuegt. Ein Index beschleunigt die Duplikatsuche.

```text
documents
  + file_hash TEXT (nullable, indexed)
```

### 2. Neue Utility: `src/utils/fileHash.ts`

Eine Hilfsfunktion berechnet den SHA-256-Hash einer Datei ueber die Web Crypto API (`crypto.subtle.digest`). Dies funktioniert komplett im Browser ohne externe Abhaengigkeiten.

- `computeFileHash(file: File): Promise<string>` - gibt den Hex-Hash zurueck
- `computeBlobHash(blob: Blob): Promise<string>` - fuer ZIP-Eintraege

### 3. Hook `useDocuments` erweitern

- Neue Funktion `checkDuplicate(hash: string): Document | undefined` die prueeft ob ein Dokument mit diesem Hash bereits existiert
- `uploadDocument` bekommt optionalen `fileHash`-Parameter
- `createDocument` bekommt optionales `file_hash`-Feld
- Der Hash wird beim Erstellen des Dokuments in der DB gespeichert

### 4. Dokument-Upload (Documents.tsx)

Vor dem Upload:
1. Hash der Datei berechnen
2. Pruefen ob Hash bereits in `documents` existiert (im lokalen State)
3. Falls Duplikat: Warnung anzeigen mit Dateiname des existierenden Dokuments und Abbruch-Option
4. Falls kein Duplikat: normaler Upload

### 5. ZIP-Upload (ZipUploadDialog.tsx)

Beim Verarbeiten der ZIP-Eintraege:
1. Fuer jeden ausgewaehlten Eintrag den Hash berechnen (aus dem entpackten Blob)
2. Gegen bestehende Dokumente und bereits in dieser Session hochgeladene Dateien pruefen
3. Duplikate werden mit einem Warn-Badge in der Ergebnisliste markiert und uebersprungen
4. In der Dateiliste vor dem Upload: Duplikate werden visuell markiert (oranges Badge "Duplikat") und automatisch abgewaehlt

## Technische Details

### Migration SQL

```text
ALTER TABLE documents ADD COLUMN file_hash TEXT;
CREATE INDEX idx_documents_file_hash ON documents(file_hash);
```

### fileHash.ts

Nutzt die native Web Crypto API:
```text
ArrayBuffer -> crypto.subtle.digest('SHA-256', buffer) -> Hex-String
```

### Duplikatpruefung-Ablauf

```text
Datei ausgewaehlt
  -> Hash berechnen (SHA-256)
  -> SELECT aus lokalen documents wo file_hash = berechneter Hash
  -> Duplikat gefunden?
     Ja -> Warnung: "Diese Datei existiert bereits als [Titel]"
           Nutzer kann abbrechen oder trotzdem hochladen
     Nein -> Normaler Upload + Hash in DB speichern
```

### ZIP-Ablauf

```text
ZIP entpackt -> Eintraege angezeigt
  -> Fuer jeden Eintrag: Hash aus Blob berechnen
  -> Duplikate markieren (Badge + automatisch abgewaehlt)
  -> Beim Upload: Hash wird in DB gespeichert
```

### Aenderungen an bestehenden Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/utils/fileHash.ts` | Neu: SHA-256 Hash-Berechnung |
| `src/hooks/useDocuments.ts` | Hash-Feld in Interface und createDocument; checkDuplicate-Funktion |
| `src/pages/Documents.tsx` | Hash berechnen vor Upload, Duplikat-Warnung anzeigen |
| `src/components/ZipUploadDialog.tsx` | Hashes fuer ZIP-Eintraege berechnen, Duplikate markieren |
| `src/utils/zipExtractor.ts` | ZipEntry um optionalen `hash`-Feld erweitern |
| DB-Migration | file_hash Spalte + Index |

### Build-Fix

Zusaetzlich wird der fehlende `pattern-bg.jpg`-Import in Layout.tsx behoben (Ursache des aktuellen Build-Fehlers), indem stattdessen ein CSS-Gradient als Hintergrundmuster verwendet wird.
