import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import {
  BackupData,
  BackupAttachmentRef,
  BackupManifest,
  BACKUP_SCHEMA_VERSION,
} from './types';
import { format } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

interface ExportContext {
  householdId: string;
  householdName: string;
  householdCreatedAt: string;
  onProgress?: (message: string, current: number, total: number) => void;
}

/**
 * Creates a full, portable backup ZIP of the household.
 * Returns a Blob ready for download.
 */
export async function createBackupZip(ctx: ExportContext): Promise<Blob> {
  const { householdId, onProgress } = ctx;
  const steps = 10;
  let step = 0;
  const progress = (msg: string) => {
    step++;
    onProgress?.(msg, step, steps);
  };

  // 1. Profiles (IBAN of other members is no longer readable — only own IBAN via RPC)
  progress('Profile laden…');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, user_id, name, has_iban, created_at, updated_at')
    .eq('household_id', householdId);
  const { data: ownIbanData } = await supabase.rpc('get_my_iban');
  const ownIban: string | null = typeof ownIbanData === 'string' ? ownIbanData : null;
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id ?? null;

  // 2. Invoices
  progress('Rechnungen laden…');
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('household_id', householdId);

  // 3. Invoice splits, payments, allocations
  progress('Kostenaufteilungen laden…');
  const invoiceIds = (invoices || []).map((i) => i.id);
  let splits: Tables<'invoice_splits'>[] = [];
  let payments: Tables<'invoice_payments'>[] = [];
  let allocations: Tables<'invoice_allocations'>[] = [];
  if (invoiceIds.length > 0) {
    const { data: splitsData } = await supabase
      .from('invoice_splits')
      .select('*')
      .in('invoice_id', invoiceIds);
    splits = splitsData || [];

    const { data: paymentsData } = await supabase
      .from('invoice_payments')
      .select('*')
      .in('invoice_id', invoiceIds);
    payments = paymentsData || [];

    const { data: allocData } = await supabase
      .from('invoice_allocations')
      .select('*')
      .in('invoice_id', invoiceIds);
    allocations = allocData || [];
  }

  // 4. Estimates + items
  progress('Kostenschätzungen laden…');
  const { data: estimates } = await supabase
    .from('architect_estimates')
    .select('*')
    .eq('household_id', householdId);

  let estimateItems: Tables<'architect_estimate_items'>[] = [];
  const estimateIds = (estimates || []).map((e) => e.id);
  if (estimateIds.length > 0) {
    const { data } = await supabase
      .from('architect_estimate_items')
      .select('*')
      .in('estimate_id', estimateIds);
    estimateItems = data || [];
  }

  // 4b. Estimate blocks (via versions)
  const { data: versionRows } = await supabase
    .from('estimate_versions')
    .select('id')
    .eq('household_id', householdId);
  const versionIds = (versionRows || []).map((v) => v.id);
  let estimateBlocks: Tables<'estimate_blocks'>[] = [];
  if (versionIds.length > 0) {
    const { data } = await supabase
      .from('estimate_blocks')
      .select('*')
      .in('version_id', versionIds);
    estimateBlocks = data || [];
  }

  // 5. Contractors
  progress('Firmen laden…');
  const { data: contractors } = await supabase
    .from('contractors')
    .select('*')
    .eq('household_id', householdId);

  // 6. Journal entries
  progress('Bautagebuch laden…');
  const { data: journalEntries } = await supabase
    .from('construction_journal')
    .select('*')
    .eq('household_id', householdId);

  // 7. Documents
  progress('Dokumente laden…');
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('household_id', householdId);

  // 7b. Gewerke-Budget (trades + Schätzversionen, seit 1.2.0)
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('household_id', householdId);
  let tradeEstimates: Tables<'trade_estimates'>[] = [];
  const tradeIds = (trades || []).map((t) => t.id);
  if (tradeIds.length > 0) {
    const { data } = await supabase
      .from('trade_estimates')
      .select('*')
      .in('trade_id', tradeIds);
    tradeEstimates = data || [];
  }

  // 7c. Kredit-Modul (loans + Anteile + Raten, seit 1.2.0)
  const { data: loans } = await supabase
    .from('loans')
    .select('*')
    .eq('household_id', householdId);
  let loanShares: Tables<'loan_shares'>[] = [];
  let loanPayments: Tables<'loan_payments'>[] = [];
  const loanIds = (loans || []).map((l) => l.id);
  if (loanIds.length > 0) {
    const { data: sharesData } = await supabase
      .from('loan_shares')
      .select('*')
      .in('loan_id', loanIds);
    loanShares = sharesData || [];
    const { data: paymentsData } = await supabase
      .from('loan_payments')
      .select('*')
      .in('loan_id', loanIds);
    loanPayments = paymentsData || [];
  }

  // 8. Collect attachment references and download files
  progress('Anhänge herunterladen…');
  const attachments: BackupAttachmentRef[] = [];
  const zip = new JSZip();
  const attachmentsFolder = zip.folder('attachments')!;

  // Helper to download and add a file to the ZIP
  const addAttachment = async (bucket: string, path: string | null, originalName: string | null) => {
    if (!path) return;
    const safeName = path.replace(/\//g, '_');
    const archivePath = `attachments/${bucket}/${safeName}`;

    try {
      const { data } = await supabase.storage.from(bucket).download(path);
      if (data) {
        const bucketFolder = attachmentsFolder.folder(bucket)!;
        bucketFolder.file(safeName, data);
        attachments.push({
          storageBucket: bucket,
          storagePath: path,
          archivePath,
          originalName: originalName || safeName,
          size: data.size,
        });
      }
    } catch {
      // Skip files that can't be downloaded
    }
  };

  // Download invoice attachments
  for (const inv of invoices || []) {
    await addAttachment('invoices', inv.file_path, inv.file_name);
  }

  // Download estimate attachments
  for (const est of estimates || []) {
    await addAttachment('estimates', est.file_path, est.file_name);
  }

  // Download document attachments
  for (const doc of documents || []) {
    await addAttachment('documents', doc.file_path, doc.file_name);
  }

  // Download journal photos
  for (const entry of journalEntries || []) {
    if (entry.photos && Array.isArray(entry.photos)) {
      for (const photoPath of entry.photos) {
        await addAttachment('journal-photos', photoPath, photoPath.split('/').pop() || null);
      }
    }
  }

  // 9. Build backup.json
  progress('Backup erstellen…');

  const stripHouseholdId = <T extends object>(obj: T): Omit<T, 'household_id'> => {
    const rest = { ...obj } as Record<string, unknown>;
    delete rest.household_id;
    return rest as Omit<T, 'household_id'>;
  };

  const backupData: BackupData = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    generator: 'baukosten-backup/1.0',
    household: {
      id: householdId,
      name: ctx.householdName,
      created_at: ctx.householdCreatedAt,
    },
    data: {
      profiles: (profiles || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        iban: p.user_id && p.user_id === currentUserId ? ownIban : null,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      invoices: (invoices || []).map((i) => stripHouseholdId(i)),
      invoiceSplits: splits.map((s) => ({ ...s })),
      invoicePayments: payments.map((p) => ({ ...p })),
      invoiceAllocations: allocations.map((a) => ({ ...a })),
      estimates: (estimates || []).map((e) => stripHouseholdId(e)),
      estimateItems: estimateItems.map((i) => ({ ...i })),
      contractors: (contractors || []).map((c) => stripHouseholdId(c)),
      journalEntries: (journalEntries || []).map((j) => stripHouseholdId(j)),
      documents: (documents || []).map((d) => stripHouseholdId(d)),
      estimateBlocks: estimateBlocks.map((b) => ({ ...b })),
      trades: (trades || []).map((t) => stripHouseholdId(t)),
      tradeEstimates: tradeEstimates.map((e) => ({ ...e })),
      loans: (loans || []).map((l) => stripHouseholdId(l)),
      loanShares: loanShares.map((s) => ({ ...s })),
      loanPayments: loanPayments.map((p) => ({ ...p })),
    },
    attachments,
  };

  const backupJson = JSON.stringify(backupData, null, 2);
  zip.file('backup.json', backupJson);

  // Build manifest.yaml (simple text, no YAML library needed)
  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: backupData.exportedAt,
    generator: backupData.generator,
    householdId,
    householdName: ctx.householdName,
    counts: {
      profiles: backupData.data.profiles.length,
      invoices: backupData.data.invoices.length,
      invoiceSplits: backupData.data.invoiceSplits.length,
      invoicePayments: backupData.data.invoicePayments.length,
      invoiceAllocations: backupData.data.invoiceAllocations.length,
      estimates: backupData.data.estimates.length,
      estimateItems: backupData.data.estimateItems.length,
      contractors: backupData.data.contractors.length,
      journalEntries: backupData.data.journalEntries.length,
      documents: backupData.data.documents.length,
      attachments: attachments.length,
      estimateBlocks: backupData.data.estimateBlocks.length,
      trades: backupData.data.trades?.length ?? 0,
      tradeEstimates: backupData.data.tradeEstimates?.length ?? 0,
      loans: backupData.data.loans?.length ?? 0,
      loanShares: backupData.data.loanShares?.length ?? 0,
      loanPayments: backupData.data.loanPayments?.length ?? 0,
    },
  };

  const manifestYaml = Object.entries(manifest)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        const inner = Object.entries(value)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n');
        return `${key}:\n${inner}`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');

  zip.file('manifest.yaml', manifestYaml);

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/**
 * Triggers a browser download of the backup ZIP.
 */
export function downloadBlob(blob: Blob, householdName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_${householdName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
