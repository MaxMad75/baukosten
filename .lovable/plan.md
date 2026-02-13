
# Fix: Dateiname-Sanitierung im Dokument-Upload

## Problem

Nach der KI-Analyse wird die Kostenschätzung über `uploadDocument()` in den `documents`-Storage-Bucket hochgeladen. Diese Funktion (`useDocuments.ts`, Zeile 53) verwendet den Original-Dateinamen **ohne Bereinigung** -- Leerzeichen, Kommas und Umlaute verursachen einen 400-Fehler vom Storage.

Die Sanitierung existiert bereits auf der Estimates-Seite für den `estimates`-Bucket, fehlt aber im zentralen `useDocuments`-Hook.

## Lösung

**Datei: `src/hooks/useDocuments.ts`**

In der `uploadDocument`-Funktion den Dateinamen bereinigen, bevor er als Storage-Pfad verwendet wird -- gleiche Logik wie auf der Estimates-Seite:

- Umlaute ersetzen (ä->ae, ö->oe, ü->ue, ß->ss)
- Leerzeichen, Kommas und Sonderzeichen durch Unterstriche ersetzen
- Mehrfache Unterstriche zusammenfassen

Der angezeigte `file.name` bleibt als Originalname erhalten (wird an den Aufrufer zurückgegeben), nur der Storage-Pfad wird bereinigt.

Keine weiteren Dateien müssen geändert werden -- die Korrektur an zentraler Stelle behebt das Problem für alle Upload-Flows (Kostenschätzungen, Dokumente, ZIP-Uploads).
