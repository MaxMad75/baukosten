
## Implementierung Prio 2 & 3: Firmenverzeichnis + Bautagebuch

### Übersicht

Wir bauen zwei neue Features:
- **Prio 2**: Firmen- und Handwerkerverzeichnis (`Contractors`)
- **Prio 3**: Bautagebuch / Construction Journal (`ConstructionJournal`)

Beide folgen der bewährten Struktur der Rechnungen/Kostenschätzung.

---

### PHASE 1: Datenbankmigrationen

#### 1.1 Tabelle `contractors`

```sql
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  
  -- Grundinformationen
  company_name text NOT NULL,
  trade text, -- z.B. "Elektriker", "Dachdecker", "Maurer"
  contact_person text,
  phone text,
  email text,
  website text,
  
  -- Notizen & Bewertung
  notes text,
  rating integer, -- 1-5 Sterne (optional)
  
  -- Tracking
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS Policies (Household-basiert wie invoices)
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contractors in their household"
  ON public.contractors
  FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert contractors in their household"
  ON public.contractors
  FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update contractors in their household"
  ON public.contractors
  FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete contractors in their household"
  ON public.contractors
  FOR DELETE
  USING (household_id = get_user_household_id());

-- Trigger für updated_at
CREATE TRIGGER contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

#### 1.2 Tabelle `construction_journal`

```sql
CREATE TABLE public.construction_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  
  -- Inhalt
  entry_date date NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  
  -- Kategorisierung
  category text, -- z.B. "Rohbau", "Elektro", "Sanitär", "Ausbau", "Mangel"
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  
  -- Fotos (werden in Storage gespeichert, hier nur Pfade)
  photos text[], -- Array von Dateipfaden
  
  -- Tracking
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.construction_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view journal entries in their household"
  ON public.construction_journal
  FOR SELECT
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert journal entries in their household"
  ON public.construction_journal
  FOR INSERT
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update journal entries in their household"
  ON public.construction_journal
  FOR UPDATE
  USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete journal entries in their household"
  ON public.construction_journal
  FOR DELETE
  USING (household_id = get_user_household_id());

-- Trigger für updated_at
CREATE TRIGGER construction_journal_updated_at
  BEFORE UPDATE ON public.construction_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

#### 1.3 Neuer Storage-Bucket für Fotos

```
Bucket Name: journal-photos
Is Public: No
```

Mit RLS-Policy ähnlich wie invoices (Household-Ordnerstruktur):
`{household_id}/{yyyy-mm}/{filename}`

---

### PHASE 2: TypeScript Types

In `src/lib/types.ts` hinzufügen:

```typescript
export interface Contractor {
  id: string;
  household_id: string;
  company_name: string;
  trade: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConstructionJournalEntry {
  id: string;
  household_id: string;
  entry_date: string;
  title: string;
  description: string;
  category: string | null;
  contractor_id: string | null;
  photos: string[] | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConstructionJournalWithDetails extends ConstructionJournalEntry {
  contractor?: Contractor;
  created_by_profile?: Profile;
}
```

---

### PHASE 3: Custom Hooks

#### 3.1 `src/hooks/useContractors.ts`

```typescript
// Struktur analog zu useInvoices.ts:
export function useContractors() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContractors = async () => {
    // SELECT * FROM contractors ORDER BY company_name
  };

  const createContractor = async (data: Omit<Contractor, ...>) => {
    // INSERT INTO contractors
  };

  const updateContractor = async (id: string, updates: Partial<Contractor>) => {
    // UPDATE contractors
  };

  const deleteContractor = async (id: string) => {
    // DELETE FROM contractors
  };

  return {
    contractors,
    loading,
    fetchContractors,
    createContractor,
    updateContractor,
    deleteContractor,
  };
}
```

#### 3.2 `src/hooks/useConstructionJournal.ts`

```typescript
// Struktur analog zu useEstimates.ts:
export function useConstructionJournal() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ConstructionJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    // SELECT * FROM construction_journal ORDER BY entry_date DESC
  };

  const createEntry = async (data: Omit<ConstructionJournalEntry, ...>) => {
    // INSERT INTO construction_journal
  };

  const updateEntry = async (id: string, updates: Partial<ConstructionJournalEntry>) => {
    // UPDATE construction_journal
  };

  const deleteEntry = async (id: string) => {
    // DELETE FROM construction_journal
  };

  const uploadPhoto = async (file: File, entryId: string) => {
    // Upload zu Storage: journal-photos/{household_id}/{yyyy-mm}/{filename}
    // Rückgabe des Pfads
  };

  return {
    entries,
    loading,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    uploadPhoto,
  };
}
```

---

### PHASE 4: React Pages

#### 4.1 `src/pages/Contractors.tsx`

**Features:**
- Liste aller Firmen mit Suche/Filter nach Gewerk
- Dialog "Neue Firma hinzufügen" mit Formular (company_name, trade, contact_person, phone, email, notes)
- Bearbeiten existierender Einträge (Edit-Button im Kontextmenü oder Modal)
- Löschen mit Bestätigung
- Optionaler Stern-Rating (1-5)
- Zeige auch: "Zugeordnete Rechnungen" (count)

**Layout:**
- Cards oder Tabelle (je nach Bildschirmgröße)
- Desktop: Tabelle (wie Invoices)
- Mobile: Cards

#### 4.2 `src/pages/ConstructionJournal.tsx`

**Features:**
- Timeline-ähnliche Ansicht chronologisch nach entry_date (neueste oben)
- Neuen Eintrag hinzufügen (Button "Neuer Eintrag")
- Eintrag bearbeiten
- Eintrag löschen mit Bestätigung
- Foto-Upload (mehrere Fotos pro Eintrag, Galerie-Vorschau)
- Kategorien-Filter (Dropdown: Rohbau, Elektro, Sanitär, Ausbau, Mangel, Alle)
- Zuordnung zu Contractor (Select mit suggestions)
- Eintrag zeigt: Datum, Titel, Beschreibung, Kategorie, Fotos, verlinkte Firma

**Modal für Eintrag:**
- entry_date (DatePicker)
- title (Input)
- description (Textarea)
- category (Select)
- contractor_id (Contractor-Select)
- Foto-Upload (Drag & Drop, mehrere Dateien)

---

### PHASE 5: Navigation & Routing

#### 5.1 Update `src/components/Layout.tsx`

Neue Nav-Items:

```typescript
const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/invoices', icon: FileText, label: 'Rechnungen' },
  { to: '/estimates', icon: Calculator, label: 'Kostenschätzung' },
  { to: '/comparison', icon: BarChart3, label: 'Soll/Ist' },
  { to: '/contractors', icon: Users, label: 'Firmen' },           // NEU
  { to: '/journal', icon: BookOpen, label: 'Bautagebuch' },        // NEU
  { to: '/export', icon: Download, label: 'Export' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];
```

(Icons: `Users` von lucide-react für Contractors, `BookOpen` für Journal)

#### 5.2 Update `src/App.tsx`

```typescript
import Contractors from "./pages/Contractors";
import ConstructionJournal from "./pages/ConstructionJournal";

// In den Routes:
<Route path="/contractors" element={<ProtectedRoute><Contractors /></ProtectedRoute>} />
<Route path="/journal" element={<ProtectedRoute><ConstructionJournal /></ProtectedRoute>} />
```

---

### PHASE 6: Implementierungsschritte

| Schritt | Aufgabe | Abhängigkeiten |
|---------|---------|---|
| 1 | DB Migrations (contractors + construction_journal Tabellen) | Keine |
| 2 | Storage Bucket erstellen (journal-photos) | Keine |
| 3 | Types in `src/lib/types.ts` hinzufügen | Phase 1 ✓ |
| 4 | `useContractors.ts` Hook implementieren | Phase 1 ✓ |
| 5 | `useConstructionJournal.ts` Hook implementieren | Phase 1 ✓ |
| 6 | `src/pages/Contractors.tsx` bauen | Phase 3, 4 ✓ |
| 7 | `src/pages/ConstructionJournal.tsx` bauen | Phase 3, 4 ✓ |
| 8 | Layout.tsx + App.tsx aktualisieren (Navigation) | Phase 6 & 7 ✓ |
| 9 | Testen end-to-end (Firmen anlegen, Tagebucheinträge mit Fotos) | Alle ✓ |

---

### Besonderheiten & Technische Details

**Contractors:**
- Keine Pflichtkategorisierung (ist optional)
- Automatische Verknüpfung mit Rechnungen möglich (später: Anzeige im Kontrahent-Detail)
- Einfaches CRUD ohne Komplexität

**Construction Journal:**
- Mehrere Fotos pro Eintrag (Array in DB)
- Foto-Upload zu Storage mit strukturiertem Pfad
- Kategorienliste ist hart codiert (kann später vom User definiert werden)
- Zuordnung zu Contractor ist optional
- Chronologische Darstellung (neueste zuerst)

**UI/UX:**
- Buttons consistent mit existierenden Pages (Plus, Edit, Trash2 Icons)
- Dialoge/Modals wie bei Invoices
- Bestätigungsdialoge für Löschungen
- Toast-Meldungen für Erfolg/Fehler

---

## Zusammenfassung

Nach dieser Implementierung hat die App:
✓ Vollständiges Firmenmanagement (Prio 2)
✓ Digitales Bautagebuch mit Foto-Dokumentation (Prio 3)
✓ Nahtlose Integration in bestehende Navigation
✓ Vollständige Datenstruktur für späteren Export/Reporting

