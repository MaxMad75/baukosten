# RLS-/Security-Review (Plan 7.1)

Durchgeführt: 08.07.2026, auf Basis aller Migrationen bis `20260708090000`.
Geprüft wurde der deklarierte Zustand in `supabase/migrations/` — bei Zweifeln
gegen die Live-DB verifizieren (SQL-Snippets unten).

## Ergebnis: solide. Ein toter Codepfad entfernt, keine offenen Lücken.

### Tabellen (18/18 mit RLS)

| Bereich | Befund |
|---|---|
| Alle 18 Tabellen | RLS aktiviert, CRUD-Policies vorhanden, durchgängig über `get_user_household_id()` auf den Haushalt gescoped (bei invoice_* über den Join zur Rechnung) |
| `get_user_household_id()` | SECURITY DEFINER, `search_path` fixiert, EXECUTE für PUBLIC/anon entzogen |
| `profiles.iban` | Spalten-GRANT: `authenticated` darf nur (id, user_id, household_id, name, has_iban, created_at, updated_at) lesen; IBAN nur über `get_my_iban()` (eigene) — sauber |
| `households` | kein DELETE-Policy (gewollt), UPDATE nur Mitglieder |
| `din276_kostengruppen` | nur SELECT — Referenzdaten, korrekt |
| `household_invitations` | alle Operationen haushalts-gescoped |
| `recalc_invoice_payment_status()` | SECURITY DEFINER + search_path fixiert; EXECUTE-Hardening durch Lovable-Scan (07.07.) |

### Storage (4/4 Buckets privat)

Alle Buckets (`invoices`, `estimates`, `documents`, `journal-photos`) sind
`public = false`; alle Policies prüfen `(storage.foldername(name))[1] =
get_user_household_id()::text`. Die frühen, zu laxen Policies für
invoices/estimates (nur `auth.uid() IS NOT NULL`) wurden in den Migrationen
`20260118114304` und `20260405073557` vollständig gedroppt.

### Behoben in diesem Review

- `useConstructionJournal.getPhotoUrl` entfernt: nutzte `getPublicUrl` auf dem
  privaten Bucket (liefert kaputte URLs), war nirgends verwendet — toter,
  irreführender Codepfad.

### Bewusst akzeptiert (kein Handlungsbedarf)

- `fetchAllPayments` / `fetchAllDeductions` / `fetchAllAllocations` selektieren
  ohne expliziten household-Filter und verlassen sich auf RLS. Die Tabellen
  haben keine eigene household_id-Spalte (Scoping über die Rechnung); RLS ist
  hier die korrekte und einzige praktikable Grenze.
- Client-seitige Checks (z. B. Duplikatwarnung) sind UX, keine Security —
  harte Garantien liegen in DB-Constraints und Policies.

### Verifikation gegen die Live-DB (optional, SQL-Editor)

```sql
-- Tabellen ohne RLS (erwartet: 0 Zeilen)
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;

-- Öffentliche Buckets (erwartet: 0 Zeilen)
SELECT id FROM storage.buckets WHERE public = true;

-- Storage-Policies ohne Haushalts-Scoping (erwartet: 0 Zeilen)
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND qual NOT LIKE '%get_user_household_id%'
  AND (with_check IS NULL OR with_check NOT LIKE '%get_user_household_id%');
```
