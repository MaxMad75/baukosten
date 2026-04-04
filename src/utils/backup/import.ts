import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { BackupData, BACKUP_SCHEMA_VERSION } from './types';

export interface RestoreResult {
  success: boolean;
  message: string;
  counts?: {
    contractors: number;
    invoices: number;
    invoiceSplits: number;
    estimates: number;
    estimateItems: number;
    journalEntries: number;
    documents: number;
    attachments: number;
  };
}

/**
 * Validates and restores a full backup ZIP into the current household.
 * Existing records with the same ID are skipped (insert-only / no overwrite).
 */
export async function restoreBackupZip(
  file: File,
  householdId: string,
  profileId: string,
  onProgress?: (message: string, current: number, total: number) => void
): Promise<RestoreResult> {
  const steps = 10;
  let step = 0;
  const progress = (msg: string) => {
    step++;
    onProgress?.(msg, step, steps);
  };

  // 1. Parse ZIP
  progress('ZIP-Datei lesen…');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { success: false, message: 'Ungültige ZIP-Datei.' };
  }

  // 2. Read backup.json
  progress('backup.json lesen…');
  const backupFile = zip.file('backup.json');
  if (!backupFile) {
    return { success: false, message: 'backup.json nicht gefunden. Keine gültige Backup-Datei.' };
  }

  let backup: BackupData;
  try {
    const text = await backupFile.async('text');
    backup = JSON.parse(text);
  } catch {
    return { success: false, message: 'backup.json konnte nicht gelesen werden.' };
  }

  // 3. Validate schema
  progress('Schema prüfen…');
  if (!backup.schemaVersion) {
    return { success: false, message: 'Kein schemaVersion-Feld gefunden.' };
  }

  const [major] = backup.schemaVersion.split('.').map(Number);
  const [currentMajor] = BACKUP_SCHEMA_VERSION.split('.').map(Number);
  if (major > currentMajor) {
    return {
      success: false,
      message: `Backup-Version ${backup.schemaVersion} ist neuer als unterstützt (${BACKUP_SCHEMA_VERSION}). Bitte aktualisieren Sie die App.`,
    };
  }

  if (!backup.data || !backup.household) {
    return { success: false, message: 'Ungültige Backup-Struktur.' };
  }

  const counts = { contractors: 0, invoices: 0, invoiceSplits: 0, invoicePayments: 0, estimates: 0, estimateItems: 0, journalEntries: 0, documents: 0, attachments: 0 };

  // ID mapping: old ID -> new ID (for referential integrity)
  const contractorIdMap = new Map<string, string>();
  const estimateIdMap = new Map<string, string>();
  const invoiceIdMap = new Map<string, string>();
  const profileIdMap = new Map<string, string>();

  // Map profiles by name (we don't create profiles, we map existing ones)
  progress('Profile zuordnen…');
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('household_id', householdId);

  for (const bp of backup.data.profiles) {
    const match = existingProfiles?.find((p) => p.name === bp.name);
    if (match) {
      profileIdMap.set(bp.id, match.id);
    }
  }

  // 4. Restore contractors
  progress('Firmen wiederherstellen…');
  for (const c of backup.data.contractors) {
    const { data, error } = await supabase
      .from('contractors')
      .insert({
        household_id: householdId,
        company_name: c.company_name,
        trade: c.trade,
        contact_person: c.contact_person,
        phone: c.phone,
        email: c.email,
        website: c.website,
        notes: c.notes,
        rating: c.rating,
      })
      .select('id')
      .single();

    if (!error && data) {
      contractorIdMap.set(c.id, data.id);
      counts.contractors++;
    }
  }

  // 5. Upload attachments and restore estimates
  progress('Kostenschätzungen wiederherstellen…');
  for (const est of backup.data.estimates) {
    let newFilePath = est.file_path;

    // Upload attachment if exists
    if (est.file_path) {
      const uploaded = await uploadAttachmentFromZip(zip, backup, 'estimates', est.file_path, householdId);
      if (uploaded) newFilePath = uploaded;
    }

    const { data, error } = await supabase
      .from('architect_estimates')
      .insert({
        household_id: householdId,
        file_path: newFilePath,
        file_name: est.file_name,
        processed: est.processed,
      })
      .select('id')
      .single();

    if (!error && data) {
      estimateIdMap.set(est.id, data.id);
      counts.estimates++;
    }
  }

  // 6. Restore estimate items
  for (const item of backup.data.estimateItems) {
    const newEstimateId = estimateIdMap.get(item.estimate_id);
    if (!newEstimateId) continue;

    const { error } = await supabase
      .from('architect_estimate_items')
      .insert({
        estimate_id: newEstimateId,
        kostengruppe_code: item.kostengruppe_code,
        estimated_amount: item.estimated_amount,
        notes: item.notes,
        is_gross: item.is_gross,
      });

    if (!error) counts.estimateItems++;
  }

  // 7. Restore invoices
  progress('Rechnungen wiederherstellen…');
  for (const inv of backup.data.invoices) {
    let newFilePath = inv.file_path;

    if (inv.file_path) {
      const uploaded = await uploadAttachmentFromZip(zip, backup, 'invoices', inv.file_path, householdId);
      if (uploaded) newFilePath = uploaded;
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        household_id: householdId,
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        invoice_date: inv.invoice_date,
        company_name: inv.company_name,
        description: inv.description,
        kostengruppe_code: inv.kostengruppe_code,
        file_path: newFilePath,
        file_name: inv.file_name,
        is_paid: inv.is_paid,
        payment_date: inv.payment_date,
        paid_by_profile_id: profileIdMap.get(inv.paid_by_profile_id || '') || null,
        ai_extracted: inv.ai_extracted,
        is_gross: inv.is_gross,
        created_by_profile_id: profileIdMap.get(inv.created_by_profile_id || '') || null,
      })
      .select('id')
      .single();

    if (!error && data) {
      invoiceIdMap.set(inv.id, data.id);
      counts.invoices++;
    }
  }

  // 8. Restore invoice splits
  progress('Kostenaufteilungen wiederherstellen…');
  for (const split of backup.data.invoiceSplits) {
    const newInvoiceId = invoiceIdMap.get(split.invoice_id);
    const newProfileId = profileIdMap.get(split.profile_id);
    if (!newInvoiceId || !newProfileId) continue;

    const { error } = await supabase
      .from('invoice_splits')
      .insert({
        invoice_id: newInvoiceId,
        profile_id: newProfileId,
        amount: split.amount,
        percentage: split.percentage,
        split_type: split.split_type,
      });

    if (!error) counts.invoiceSplits++;
  }

  // 9. Restore journal entries
  progress('Bautagebuch wiederherstellen…');
  for (const entry of backup.data.journalEntries) {
    const newPhotos: string[] = [];
    if (entry.photos) {
      for (const photoPath of entry.photos) {
        const uploaded = await uploadAttachmentFromZip(zip, backup, 'journal-photos', photoPath, householdId);
        if (uploaded) newPhotos.push(uploaded);
      }
    }

    const { error } = await supabase
      .from('construction_journal')
      .insert({
        household_id: householdId,
        entry_date: entry.entry_date,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        contractor_id: contractorIdMap.get(entry.contractor_id || '') || null,
        photos: newPhotos.length > 0 ? newPhotos : null,
        created_by_profile_id: profileIdMap.get(entry.created_by_profile_id || '') || null,
      });

    if (!error) counts.journalEntries++;
  }

  // 10. Restore documents
  progress('Dokumente wiederherstellen…');
  for (const doc of backup.data.documents) {
    let newFilePath = doc.file_path;

    const uploaded = await uploadAttachmentFromZip(zip, backup, 'documents', doc.file_path, householdId);
    if (uploaded) newFilePath = uploaded;

    const { error } = await supabase
      .from('documents')
      .insert({
        household_id: householdId,
        file_path: newFilePath,
        file_name: doc.file_name,
        file_size: doc.file_size,
        title: doc.title,
        document_type: doc.document_type,
        description: doc.description,
        contractor_id: contractorIdMap.get(doc.contractor_id || '') || null,
        ai_analyzed: doc.ai_analyzed,
        ai_summary: doc.ai_summary,
        file_hash: doc.file_hash,
        created_by_profile_id: profileIdMap.get(doc.created_by_profile_id || '') || null,
      });

    if (!error) counts.documents++;
  }

  // Count uploaded attachments
  counts.attachments = backup.attachments?.length || 0;

  return {
    success: true,
    message: `Backup erfolgreich wiederhergestellt.`,
    counts,
  };
}

/**
 * Finds an attachment in the ZIP by its storage path and uploads it to the target bucket.
 * Returns the new storage path, or null if the file wasn't found.
 */
async function uploadAttachmentFromZip(
  zip: JSZip,
  backup: BackupData,
  bucket: string,
  storagePath: string,
  householdId: string
): Promise<string | null> {
  const ref = backup.attachments?.find(
    (a) => a.storageBucket === bucket && a.storagePath === storagePath
  );
  if (!ref) return null;

  const zipFile = zip.file(ref.archivePath);
  if (!zipFile) return null;

  try {
    const blob = await zipFile.async('blob');
    const newPath = `${householdId}/${Date.now()}_${ref.originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

    const { error } = await supabase.storage.from(bucket).upload(newPath, blob);
    if (error) return null;
    return newPath;
  } catch {
    return null;
  }
}
