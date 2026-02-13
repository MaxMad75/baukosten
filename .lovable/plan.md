
# Drei Verbesserungen: Mitglieder hinzufuegen, Kostengruppen-Suche, Darstellungsfix

## 1. Haushaltsmitglieder manuell hinzufuegen

Aktuell koennen Mitglieder nur per E-Mail-Einladung hinzugefuegt werden. Da du aber Rechnungen auch Personen zuweisen willst, die noch keinen Account haben, wird eine Funktion zum manuellen Anlegen von "Platzhalter-Profilen" eingebaut.

**Aenderung in `src/pages/Settings.tsx`:**
- Neuer Bereich "Mitglied manuell anlegen" mit Feldern: Name und optional IBAN
- Erstellt einen Eintrag in der `profiles`-Tabelle mit `user_id = NULL` (Platzhalter-Profil ohne Login)
- Diese Profile tauchen dann bei Rechnungszuweisung ("Bezahlt von") auf
- Spaeter kann ein eingeladener Nutzer mit diesem Profil verknuepft werden

**Datenbank-Migration:**
- Spalte `user_id` in `profiles` muss `NULL` erlauben (aktuell pruefen ob schon nullable)
- Ggf. RLS-Policy anpassen, damit Haushaltsmitglieder Profile ohne `user_id` erstellen koennen

## 2. Suchfunktion in der Kostengruppen-Auswahl

Die aktuelle `KostengruppenSelect`-Komponente nutzt ein einfaches Radix Select ohne Suchmoeglichkeit. Bei ueber 50 Eintraegen ist das unuebersichtlich.

**Aenderung in `src/components/KostengruppenSelect.tsx`:**
- Umstellung von `Select` auf `Popover` + `Command` (cmdk) fuer eine durchsuchbare Auswahlliste
- Suchfeld filtert Code und Name gleichzeitig (z.B. "Dach" findet "361 - Dachkonstruktionen")
- Hierarchische Darstellung bleibt erhalten, gefilterte Ergebnisse zeigen nur Treffer
- Wird automatisch ueberall wirksam: Rechnungs-Edit, Kostenschaetzung-Upload, manuelles Anlegen

## 3. Darstellungsfix: Doppelte Oberkategorien entfernen

Das aktuelle Problem: Jede Level-1-Kostengruppe (z.B. "600 - Ausstattung und Kunstwerke") erscheint **zweimal** -- einmal als nicht-klickbares Label (`SelectLabel`) und direkt darunter nochmal als klickbarer Eintrag (`SelectItem`). Das ist verwirrend.

**Loesung:**
- Level-1-Gruppen werden nur als Gruppenueberschriften angezeigt (nicht auswaehlbar), da man immer eine spezifischere Untergruppe waehlen sollte
- Falls doch Level-1 auswaehlbar sein soll, wird das Label entfernt und nur der SelectItem beibehalten
- Die neue cmdk-basierte Komponente loest das automatisch, da jeder Eintrag genau einmal erscheint

---

## Technische Details

| Datei | Aenderung |
|-------|-----------|
| `src/components/KostengruppenSelect.tsx` | Komplett umgebaut auf Popover + Command (cmdk) mit Suchfeld, hierarchischer Darstellung ohne Duplikate |
| `src/pages/Settings.tsx` | Neuer Abschnitt "Mitglied manuell anlegen" mit Name/IBAN-Formular |
| Datenbank-Migration | `profiles.user_id` auf nullable setzen + RLS-Policy fuer Profil-Insert durch Haushaltsmitglieder |

