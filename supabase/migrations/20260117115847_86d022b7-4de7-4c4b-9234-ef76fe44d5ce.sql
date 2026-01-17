-- ============================================
-- HAUSBAU-DOKUMENTATION DATABASE SCHEMA
-- ============================================

-- 1. Households table (for shared access between couple)
CREATE TABLE public.households (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Mein Haushalt',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  iban TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. DIN 276 Kostengruppen (3-level hierarchy)
CREATE TABLE public.din276_kostengruppen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_code TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Architect cost estimates
CREATE TABLE public.architect_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT,
  file_name TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Architect estimate items (extracted costs per Kostengruppe)
CREATE TABLE public.architect_estimate_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id UUID REFERENCES public.architect_estimates(id) ON DELETE CASCADE NOT NULL,
  kostengruppe_code TEXT NOT NULL,
  estimated_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT,
  amount DECIMAL(12,2) NOT NULL,
  invoice_date DATE NOT NULL,
  company_name TEXT NOT NULL,
  description TEXT,
  kostengruppe_code TEXT,
  file_path TEXT,
  file_name TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  payment_date DATE,
  paid_by_profile_id UUID REFERENCES public.profiles(id),
  ai_extracted BOOLEAN NOT NULL DEFAULT false,
  created_by_profile_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get household ID for current user
CREATE OR REPLACE FUNCTION public.get_user_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Check if user belongs to a household
CREATE OR REPLACE FUNCTION public.is_household_member(check_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND household_id = check_household_id
  )
$$;

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.din276_kostengruppen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.architect_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.architect_estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Households policies
CREATE POLICY "Users can view their household"
  ON public.households FOR SELECT
  USING (public.is_household_member(id));

CREATE POLICY "Users can update their household"
  ON public.households FOR UPDATE
  USING (public.is_household_member(id));

-- Profiles policies
CREATE POLICY "Users can view profiles in their household"
  ON public.profiles FOR SELECT
  USING (household_id = public.get_user_household_id());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update profiles in their household"
  ON public.profiles FOR UPDATE
  USING (household_id = public.get_user_household_id());

-- DIN 276 - readable by all authenticated users
CREATE POLICY "DIN276 is readable by authenticated users"
  ON public.din276_kostengruppen FOR SELECT
  TO authenticated
  USING (true);

-- Architect estimates policies
CREATE POLICY "Users can view estimates in their household"
  ON public.architect_estimates FOR SELECT
  USING (household_id = public.get_user_household_id());

CREATE POLICY "Users can insert estimates in their household"
  ON public.architect_estimates FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id());

CREATE POLICY "Users can update estimates in their household"
  ON public.architect_estimates FOR UPDATE
  USING (household_id = public.get_user_household_id());

CREATE POLICY "Users can delete estimates in their household"
  ON public.architect_estimates FOR DELETE
  USING (household_id = public.get_user_household_id());

-- Architect estimate items policies
CREATE POLICY "Users can view estimate items via estimate"
  ON public.architect_estimate_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.architect_estimates 
      WHERE id = estimate_id 
      AND household_id = public.get_user_household_id()
    )
  );

CREATE POLICY "Users can insert estimate items via estimate"
  ON public.architect_estimate_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.architect_estimates 
      WHERE id = estimate_id 
      AND household_id = public.get_user_household_id()
    )
  );

CREATE POLICY "Users can update estimate items via estimate"
  ON public.architect_estimate_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.architect_estimates 
      WHERE id = estimate_id 
      AND household_id = public.get_user_household_id()
    )
  );

CREATE POLICY "Users can delete estimate items via estimate"
  ON public.architect_estimate_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.architect_estimates 
      WHERE id = estimate_id 
      AND household_id = public.get_user_household_id()
    )
  );

-- Invoices policies
CREATE POLICY "Users can view invoices in their household"
  ON public.invoices FOR SELECT
  USING (household_id = public.get_user_household_id());

CREATE POLICY "Users can insert invoices in their household"
  ON public.invoices FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id());

CREATE POLICY "Users can update invoices in their household"
  ON public.invoices FOR UPDATE
  USING (household_id = public.get_user_household_id());

CREATE POLICY "Users can delete invoices in their household"
  ON public.invoices FOR DELETE
  USING (household_id = public.get_user_household_id());

-- ============================================
-- INSERT DIN 276 KOSTENGRUPPEN (Full 3-Level)
-- ============================================

-- Level 1: Main groups (100-800)
INSERT INTO public.din276_kostengruppen (code, name, level) VALUES
('100', 'Grundstück', 1),
('200', 'Vorbereitende Maßnahmen', 1),
('300', 'Bauwerk - Baukonstruktionen', 1),
('400', 'Bauwerk - Technische Anlagen', 1),
('500', 'Außenanlagen und Freiflächen', 1),
('600', 'Ausstattung und Kunstwerke', 1),
('700', 'Baunebenkosten', 1),
('800', 'Finanzierung', 1);

-- Level 2: Subgroups
INSERT INTO public.din276_kostengruppen (code, name, parent_code, level) VALUES
-- 100 Grundstück
('110', 'Grundstückswert', '100', 2),
('120', 'Grundstücksnebenkosten', '100', 2),
('130', 'Freimachen', '100', 2),

-- 200 Vorbereitende Maßnahmen
('210', 'Herrichten', '200', 2),
('220', 'Öffentliche Erschließung', '200', 2),
('230', 'Nichtöffentliche Erschließung', '200', 2),
('240', 'Ausgleichsabgaben', '200', 2),
('250', 'Übergangsmaßnahmen', '200', 2),

-- 300 Bauwerk - Baukonstruktionen
('310', 'Baugrube/Erdbau', '300', 2),
('320', 'Gründung, Unterbau', '300', 2),
('330', 'Außenwände/Vertikale Baukonstruktionen, außen', '300', 2),
('340', 'Innenwände/Vertikale Baukonstruktionen, innen', '300', 2),
('350', 'Decken/Horizontale Baukonstruktionen', '300', 2),
('360', 'Dächer', '300', 2),
('370', 'Infrastrukturanlagen', '300', 2),
('390', 'Sonstige Maßnahmen für Baukonstruktionen', '300', 2),

-- 400 Bauwerk - Technische Anlagen
('410', 'Abwasser-, Wasser-, Gasanlagen', '400', 2),
('420', 'Wärmeversorgungsanlagen', '400', 2),
('430', 'Raumlufttechnische Anlagen', '400', 2),
('440', 'Elektrische Anlagen', '400', 2),
('450', 'Kommunikations-, sicherheits- und informationstechnische Anlagen', '400', 2),
('460', 'Förderanlagen', '400', 2),
('470', 'Nutzungsspezifische und verfahrenstechnische Anlagen', '400', 2),
('480', 'Gebäude- und Anlagenautomation', '400', 2),
('490', 'Sonstige Maßnahmen für technische Anlagen', '400', 2),

-- 500 Außenanlagen
('510', 'Erdbau', '500', 2),
('520', 'Gründung, Unterbau', '500', 2),
('530', 'Oberbau, Deckschichten', '500', 2),
('540', 'Baukonstruktionen', '500', 2),
('550', 'Technische Anlagen', '500', 2),
('560', 'Einbauten in Außenanlagen', '500', 2),
('570', 'Vegetationsflächen', '500', 2),
('590', 'Sonstige Außenanlagen', '500', 2),

-- 600 Ausstattung
('610', 'Allgemeine Ausstattung', '600', 2),
('620', 'Besondere Ausstattung', '600', 2),
('630', 'Informationstechnische Ausstattung', '600', 2),
('640', 'Künstlerische Ausstattung', '600', 2),

-- 700 Baunebenkosten
('710', 'Bauherrenaufgaben', '700', 2),
('720', 'Vorbereitung der Objektplanung', '700', 2),
('730', 'Architekten- und Ingenieurleistungen', '700', 2),
('740', 'Gutachten und Beratung', '700', 2),
('750', 'Künstlerische Leistungen', '700', 2),
('760', 'Finanzierungskosten', '700', 2),
('770', 'Allgemeine Baunebenkosten', '700', 2),
('790', 'Sonstige Baunebenkosten', '700', 2),

-- 800 Finanzierung
('810', 'Finanzierungsnebenkosten', '800', 2),
('820', 'Fremdkapitalzinsen', '800', 2);

-- Level 3: Detailed subgroups (most common ones)
INSERT INTO public.din276_kostengruppen (code, name, parent_code, level) VALUES
-- 310 Baugrube
('311', 'Baugrubenaushub', '310', 3),
('312', 'Baugrubenumschließung', '310', 3),
('313', 'Wasserhaltung', '310', 3),
('319', 'Baugrube, sonstiges', '310', 3),

-- 320 Gründung
('321', 'Baugrundverbesserung', '320', 3),
('322', 'Flachgründungen', '320', 3),
('323', 'Tiefgründungen', '320', 3),
('324', 'Unterböden und Bodenplatten', '320', 3),
('325', 'Bodenbeläge', '320', 3),
('326', 'Bauwerksabdichtungen', '320', 3),
('327', 'Dränagen', '320', 3),
('329', 'Gründung, sonstiges', '320', 3),

-- 330 Außenwände
('331', 'Tragende Außenwände', '330', 3),
('332', 'Nichttragende Außenwände', '330', 3),
('333', 'Außenstützen', '330', 3),
('334', 'Außentüren und -fenster', '330', 3),
('335', 'Außenwandbekleidungen, außen', '330', 3),
('336', 'Außenwandbekleidungen, innen', '330', 3),
('337', 'Elementierte Außenwände', '330', 3),
('338', 'Sonnenschutz', '330', 3),
('339', 'Außenwände, sonstiges', '330', 3),

-- 340 Innenwände
('341', 'Tragende Innenwände', '340', 3),
('342', 'Nichttragende Innenwände', '340', 3),
('343', 'Innenstützen', '340', 3),
('344', 'Innentüren und -fenster', '340', 3),
('345', 'Innenwandbekleidungen', '340', 3),
('346', 'Elementierte Innenwände', '340', 3),
('349', 'Innenwände, sonstiges', '340', 3),

-- 350 Decken
('351', 'Deckenkonstruktionen', '350', 3),
('352', 'Deckenbeläge', '350', 3),
('353', 'Deckenbekleidungen', '350', 3),
('359', 'Decken, sonstiges', '350', 3),

-- 360 Dächer
('361', 'Dachkonstruktionen', '360', 3),
('362', 'Dachfenster, Dachöffnungen', '360', 3),
('363', 'Dachbeläge', '360', 3),
('364', 'Dachbekleidungen', '360', 3),
('369', 'Dächer, sonstiges', '360', 3),

-- 410 Abwasser, Wasser, Gas
('411', 'Abwasseranlagen', '410', 3),
('412', 'Wasseranlagen', '410', 3),
('413', 'Gasanlagen', '410', 3),
('419', 'Abwasser-, Wasser-, Gasanlagen, sonstiges', '410', 3),

-- 420 Wärmeversorgung
('421', 'Wärmeerzeugungsanlagen', '420', 3),
('422', 'Wärmeverteilnetze', '420', 3),
('423', 'Raumheizflächen', '420', 3),
('424', 'Verkehrsflächenheizung', '420', 3),
('429', 'Wärmeversorgungsanlagen, sonstiges', '420', 3),

-- 430 Raumlufttechnik
('431', 'Lüftungsanlagen', '430', 3),
('432', 'Teilklimaanlagen', '430', 3),
('433', 'Klimaanlagen', '430', 3),
('434', 'Kälteanlagen', '430', 3),
('439', 'Raumlufttechnische Anlagen, sonstiges', '430', 3),

-- 440 Elektrische Anlagen
('441', 'Hoch- und Mittelspannungsanlagen', '440', 3),
('442', 'Eigenstromversorgungsanlagen', '440', 3),
('443', 'Niederspannungsschaltanlagen', '440', 3),
('444', 'Niederspannungsinstallationsanlagen', '440', 3),
('445', 'Beleuchtungsanlagen', '440', 3),
('446', 'Blitzschutz- und Erdungsanlagen', '440', 3),
('449', 'Elektrische Anlagen, sonstiges', '440', 3),

-- 450 Kommunikation
('451', 'Telekommunikationsanlagen', '450', 3),
('452', 'Such- und Signalanlagen', '450', 3),
('453', 'Zeitdienstanlagen', '450', 3),
('454', 'Elektroakustische Anlagen', '450', 3),
('455', 'Audiovisuelle Medienanlagen', '450', 3),
('456', 'Gefahrenmelde- und Alarmanlagen', '450', 3),
('457', 'Übertragungsnetze', '450', 3),
('459', 'Kommunikations-, sicherheits- und informationstechnische Anlagen, sonstiges', '450', 3),

-- 730 Architekten- und Ingenieurleistungen
('731', 'Gebäudeplanung', '730', 3),
('732', 'Freianlagenplanung', '730', 3),
('733', 'Tragwerksplanung', '730', 3),
('734', 'Technische Ausrüstung', '730', 3),
('735', 'Bauphysik', '730', 3),
('739', 'Architekten- und Ingenieurleistungen, sonstiges', '730', 3);

-- ============================================
-- STORAGE BUCKET FOR FILES
-- ============================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('invoices', 'invoices', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('estimates', 'estimates', false);

-- Storage policies for invoices bucket
CREATE POLICY "Users can upload invoice files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view invoice files in their household"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete invoice files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
  );

-- Storage policies for estimates bucket
CREATE POLICY "Users can upload estimate files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view estimate files in their household"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete estimate files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'estimates' 
    AND auth.uid() IS NOT NULL
  );