/**
 * Backup format types for portable, versioned full-export packages.
 * Schema version follows semver — bump major on breaking changes.
 */

export const BACKUP_SCHEMA_VERSION = '1.0.0';

export interface BackupManifest {
  schemaVersion: string;
  exportedAt: string;
  generator: string;
  householdId: string;
  householdName: string;
  counts: {
    profiles: number;
    invoices: number;
    invoiceSplits: number;
    invoicePayments: number;
    estimates: number;
    estimateItems: number;
    contractors: number;
    journalEntries: number;
    documents: number;
    attachments: number;
  };
  checksums?: {
    backupJson: string;
  };
}

export interface BackupAttachmentRef {
  /** Original storage path (bucket/path) */
  storageBucket: string;
  storagePath: string;
  /** Path inside ZIP: attachments/<bucket>/<filename> */
  archivePath: string;
  /** Original filename */
  originalName: string;
  /** Size in bytes (if known) */
  size?: number;
}

export interface BackupProfile {
  id: string;
  user_id: string | null;
  name: string;
  iban: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupInvoice {
  id: string;
  invoice_number: string | null;
  amount: number;
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
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupInvoiceSplit {
  id: string;
  invoice_id: string;
  profile_id: string;
  amount: number;
  percentage: number | null;
  split_type: string;
  created_at: string;
}

export interface BackupEstimate {
  id: string;
  file_path: string | null;
  file_name: string | null;
  uploaded_at: string;
  processed: boolean;
  created_at: string;
}

export interface BackupEstimateItem {
  id: string;
  estimate_id: string;
  kostengruppe_code: string;
  estimated_amount: number;
  notes: string | null;
  is_gross: boolean;
  created_at: string;
}

export interface BackupContractor {
  id: string;
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

export interface BackupJournalEntry {
  id: string;
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

export interface BackupDocument {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  title: string;
  document_type: string | null;
  description: string | null;
  contractor_id: string | null;
  ai_analyzed: boolean;
  ai_summary: string | null;
  file_hash: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupInvoicePayment {
  id: string;
  invoice_id: string;
  profile_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface BackupData {
  schemaVersion: string;
  exportedAt: string;
  generator: string;
  household: {
    id: string;
    name: string;
    created_at: string;
  };
  data: {
    profiles: BackupProfile[];
    invoices: BackupInvoice[];
    invoiceSplits: BackupInvoiceSplit[];
    invoicePayments: BackupInvoicePayment[];
    estimates: BackupEstimate[];
    estimateItems: BackupEstimateItem[];
    contractors: BackupContractor[];
    journalEntries: BackupJournalEntry[];
    documents: BackupDocument[];
  };
  attachments: BackupAttachmentRef[];
}
