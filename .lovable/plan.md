
# Kostenschätzungen auch als Dokumente ablegen mit Duplikaterkennung

## Zusammenfassung

Wenn eine Kostenschätzung hochgeladen wird, soll die Datei nach der KI-Analyse auch im zentralen Dokumentenmanagement abgelegt werden -- inklusive SHA-256 Duplikaterkennung vor dem Ablegen.

## Ablauf

```text
1. Nutzer lädt PDF hoch
2. KI analysiert das Dokument (wie bisher)
3. Nutzer prüft/speichert die extrahierten Kosten (wie bisher)
4. VOR dem Ablegen: SHA-256 Hash berechnen
5. Hash gegen bestehende Dokumente prüfen (checkDuplicate)
6. Falls Duplikat: Warnung anzeigen, Nutzer entscheidet ob trotzdem ablegen
7. Datei wird in den "documents"-Storage-Bucket kopiert (da Estimates einen eigenen Bucket nutzen)
8. Eintrag in der documents-Tabelle erstellen (Typ: "Kostenschätzung")
```

## Technische Änderungen

### 1. `src/pages/Estimates.tsx`

**Import hinzufügen**: `computeFileHash` aus `@/utils/fileHash`

**`useDocuments` erweitern**: Neben `getDocumentUrl` auch `uploadDocument`, `createDocument`, `checkDuplicate`, `documents` importieren

**`handleFileUpload` erweitern** (nach erfolgreicher KI-Analyse und Speicherung der Kostenpositionen):
- Im `handleSaveExtractedItems` nach dem erfolgreichen `addEstimateItems`:
  - Die Original-Datei hashen (`computeFileHash`)
  - `checkDuplicate(hash)` aufrufen
  - Falls Duplikat: Toast-Warnung "Dieses Dokument existiert bereits in der Dokumentenbibliothek" -- trotzdem als Kostenschätzung speichern, aber kein neues Dokument anlegen
  - Falls kein Duplikat: Datei in den `documents`-Bucket hochladen und `createDocument` aufrufen mit `document_type: 'Kostenschätzung'`, `file_hash`, und den Datei-Infos

**Neue State-Variable**: `pendingFile` -- speichert die Original-File-Referenz, damit nach dem Speichern der Hash berechnet und die Datei ins Documents-System übernommen werden kann

**`handleDocumentSelect`**: Hier wird kein neues Dokument angelegt, da das Dokument bereits existiert. Nur ein Info-Toast.

### 2. `src/hooks/useDocuments.ts`

Keine Änderungen nötig -- `uploadDocument`, `createDocument`, `checkDuplicate` sind bereits vorhanden.

### Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| `src/pages/Estimates.tsx` | Dokument-Ablage nach Speicherung, Duplikaterkennung, `pendingFile`-State |
