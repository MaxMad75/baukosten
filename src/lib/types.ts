export interface Profile {
  id: string;
  user_id: string;
  household_id: string;
  name: string;
  iban: string | null;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
}

export interface DIN276Kostengruppe {
  id: string;
  code: string;
  name: string;
  parent_code: string | null;
  level: number;
  created_at: string;
}

export type InvoiceStatus = 'draft' | 'review_needed' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';

export interface Invoice {
  id: string;
  household_id: string;
  invoice_number: string | null;
  amount: number;
  net_amount: number | null;
  tax_amount: number | null;
  invoice_date: string;
  company_name: string;
  description: string | null;
  kostengruppe_code: string | null;
  file_path: string | null;
  file_name: string | null;
  is_paid: boolean;
  payment_date: string | null;
  paid_by_profile_id: string | null;
  ai_extracted: boolean;
  is_gross: boolean;
  status: InvoiceStatus;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  profile_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface ArchitectEstimate {
  id: string;
  household_id: string;
  file_path: string | null;
  file_name: string | null;
  uploaded_at: string;
  processed: boolean;
  created_at: string;
  parent_id: string | null;
  version_number: number;
  is_active: boolean;
  notes: string | null;
}

export interface ArchitectEstimateItem {
  id: string;
  estimate_id: string;
  kostengruppe_code: string;
  estimated_amount: number;
  notes: string | null;
  is_gross: boolean;
  created_at: string;
}

export interface InvoiceWithDetails extends Invoice {
  kostengruppe?: DIN276Kostengruppe;
  paid_by_profile?: Profile;
  created_by_profile?: Profile;
}

export interface CostComparison {
  kostengruppe_code: string;
  kostengruppe_name: string;
  estimated: number;
  actual: number;
  difference: number;
  percentage: number;
}

export interface ExtractedInvoiceData {
  invoice_number: string | null;
  amount: number;
  invoice_date: string;
  company_name: string;
  description: string;
  kostengruppe_code: string;
  kostengruppe_reasoning: string;
}

export interface ExtractedEstimateData {
  items: Array<{
    kostengruppe_code: string;
    estimated_amount: number;
    notes: string;
    is_gross: boolean;
  }>;
  total: number;
}

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

export interface InvoiceSplit {
  id: string;
  invoice_id: string;
  profile_id: string;
  amount: number;
  percentage: number | null;
  split_type: 'equal' | 'manual' | 'percentage';
  created_at: string;
}
