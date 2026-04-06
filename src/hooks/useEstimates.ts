import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArchitectEstimate, ArchitectEstimateItem, EstimateVersion, EstimateBlock, TaxStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useEstimates() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [allEstimates, setAllEstimates] = useState<ArchitectEstimate[]>([]);
  const [allEstimateItems, setAllEstimateItems] = useState<ArchitectEstimateItem[]>([]);
  const [allBlocks, setAllBlocks] = useState<EstimateBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Derived: active version
  const activeVersion = versions.find(v => v.is_active) || null;

  // Derived: blocks for active version
  const activeBlocks = allBlocks.filter(b => activeVersion && b.version_id === activeVersion.id);

  // Derived: estimates linked to active version (legacy path)
  const estimates = allEstimates.filter(e => activeVersion && e.version_id === activeVersion.id);

  // Derived: items from active version — dual path (block-linked + legacy estimate-linked)
  const activeEstimateIds = new Set(estimates.map(e => e.id));
  const activeBlockIds = new Set(activeBlocks.map(b => b.id));
  const estimateItems = allEstimateItems.filter(i =>
    (i.block_id && activeBlockIds.has(i.block_id)) ||
    (!i.block_id && activeEstimateIds.has(i.estimate_id))
  );

  const fetchEstimates = async () => {
    if (!household) return;

    setLoading(true);

    const [versionsRes, estimatesRes] = await Promise.all([
      supabase
        .from('estimate_versions')
        .select('*')
        .eq('household_id', household.id)
        .order('version_number', { ascending: true }),
      supabase
        .from('architect_estimates')
        .select('*')
        .eq('household_id', household.id)
        .order('uploaded_at', { ascending: false }),
    ]);

    const fetchedVersions = (versionsRes.data || []) as EstimateVersion[];
    const fetchedEstimates = (estimatesRes.data || []) as ArchitectEstimate[];

    setVersions(fetchedVersions);
    setAllEstimates(fetchedEstimates);

    // Fetch blocks for all versions
    const versionIds = fetchedVersions.map(v => v.id);
    if (versionIds.length > 0) {
      const { data: blocksData } = await supabase
        .from('estimate_blocks')
        .select('*')
        .in('version_id', versionIds)
        .order('sort_order', { ascending: true });
      setAllBlocks((blocksData || []) as EstimateBlock[]);
    } else {
      setAllBlocks([]);
    }

    // Fetch all items
    const estimateIds = fetchedEstimates.map(e => e.id);
    if (estimateIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('architect_estimate_items')
        .select('*')
        .in('estimate_id', estimateIds);

      setAllEstimateItems((itemsData || []) as ArchitectEstimateItem[]);
    } else {
      // Also check for block-linked items without estimate_id
      if (versionIds.length > 0) {
        // Items linked to blocks are already covered via estimate_id IN query
        // since block_id items also have estimate_id set in legacy
        setAllEstimateItems([]);
      } else {
        setAllEstimateItems([]);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchEstimates();
  }, [household]);

  /** Activate a specific version, deactivate all others, sync architect_estimates.is_active */
  const setActiveVersion = async (versionId: string) => {
    if (!household) return false;

    await supabase
      .from('estimate_versions')
      .update({ is_active: false })
      .eq('household_id', household.id);

    const { error } = await supabase
      .from('estimate_versions')
      .update({ is_active: true })
      .eq('id', versionId);

    if (error) {
      toast({ title: 'Fehler', description: 'Version konnte nicht aktiviert werden', variant: 'destructive' });
      return false;
    }

    // Sync architect_estimates.is_active as side effect
    const allVersionIds = versions.map(v => v.id);
    if (allVersionIds.length > 0) {
      await supabase
        .from('architect_estimates')
        .update({ is_active: false })
        .in('version_id', allVersionIds);

      await supabase
        .from('architect_estimates')
        .update({ is_active: true })
        .eq('version_id', versionId);
    }

    await fetchEstimates();
    return true;
  };

  /** Create a new estimate version */
  const createVersion = async (name: string): Promise<EstimateVersion | null> => {
    if (!household) return null;

    const maxNum = versions.length > 0
      ? Math.max(...versions.map(v => v.version_number))
      : 0;

    if (versions.length > 0) {
      await supabase
        .from('estimate_versions')
        .update({ is_active: false })
        .eq('household_id', household.id);

      const allVersionIds = versions.map(v => v.id);
      await supabase
        .from('architect_estimates')
        .update({ is_active: false })
        .in('version_id', allVersionIds);
    }

    const { data, error } = await supabase
      .from('estimate_versions')
      .insert({
        household_id: household.id,
        version_number: maxNum + 1,
        name: name || `V${maxNum + 1}`,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Version konnte nicht erstellt werden', variant: 'destructive' });
      return null;
    }

    await fetchEstimates();
    return data as EstimateVersion;
  };

  /** Update the name of a version */
  const updateVersionName = async (versionId: string, name: string) => {
    const { error } = await supabase
      .from('estimate_versions')
      .update({ name })
      .eq('id', versionId);

    if (error) {
      toast({ title: 'Fehler', description: 'Versionsname konnte nicht geändert werden', variant: 'destructive' });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  /** Create an estimate record within a version (legacy path for imported blocks) */
  const createEstimate = async (filePath: string, fileName: string, versionId?: string) => {
    if (!household) return null;

    let targetVersionId = versionId;
    if (!targetVersionId) {
      if (activeVersion) {
        targetVersionId = activeVersion.id;
      } else {
        const newVersion = await createVersion('V1');
        if (!newVersion) return null;
        targetVersionId = newVersion.id;
      }
    }

    const { data, error } = await supabase
      .from('architect_estimates')
      .insert({
        household_id: household.id,
        file_path: filePath,
        file_name: fileName,
        version_id: targetVersionId,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Kostenschätzung konnte nicht erstellt werden',
        variant: 'destructive',
      });
      return null;
    }

    await fetchEstimates();
    return data as ArchitectEstimate;
  };

  const addEstimateItems = async (estimateId: string, items: Array<{ kostengruppe_code: string; estimated_amount: number; notes?: string; is_gross?: boolean; tax_status?: TaxStatus }>) => {
    const { error } = await supabase
      .from('architect_estimate_items')
      .insert(
        items.map(item => {
          const taxStatus = item.tax_status || (item.is_gross ? 'gross' : 'net');
          return {
            estimate_id: estimateId,
            kostengruppe_code: item.kostengruppe_code,
            estimated_amount: item.estimated_amount,
            notes: item.notes || null,
            is_gross: taxStatus === 'gross',
            tax_status: taxStatus,
          };
        })
      );

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Kostenpositionen konnten nicht hinzugefügt werden',
        variant: 'destructive',
      });
      return false;
    }

    await supabase
      .from('architect_estimates')
      .update({ processed: true })
      .eq('id', estimateId);

    await fetchEstimates();
    return true;
  };

  // ── Block CRUD ──

  /** Create a new block within a version */
  const createBlock = async (
    versionId: string,
    blockType: 'imported' | 'manual',
    label: string,
    filePath?: string,
    fileName?: string
  ): Promise<EstimateBlock | null> => {
    const existingBlocks = allBlocks.filter(b => b.version_id === versionId);
    const sortOrder = existingBlocks.length;

    const { data, error } = await supabase
      .from('estimate_blocks')
      .insert({
        version_id: versionId,
        block_type: blockType,
        label,
        file_path: filePath || null,
        file_name: fileName || null,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Block konnte nicht erstellt werden', variant: 'destructive' });
      return null;
    }

    await fetchEstimates();
    return data as EstimateBlock;
  };

  /** Add items to a block. Requires a dummy estimate_id for the legacy FK. */
  const addBlockItems = async (
    blockId: string,
    estimateId: string,
    items: Array<{ kostengruppe_code: string; estimated_amount: number; notes?: string; is_gross?: boolean; tax_status?: TaxStatus }>
  ) => {
    const { error } = await supabase
      .from('architect_estimate_items')
      .insert(
        items.map(item => {
          const taxStatus = item.tax_status || (item.is_gross ? 'gross' : 'net');
          return {
            estimate_id: estimateId,
            block_id: blockId,
            kostengruppe_code: item.kostengruppe_code,
            estimated_amount: item.estimated_amount,
            notes: item.notes || null,
            is_gross: taxStatus === 'gross',
            tax_status: taxStatus,
          };
        })
      );

    if (error) {
      toast({ title: 'Fehler', description: 'Positionen konnten nicht hinzugefügt werden', variant: 'destructive' });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  /** Delete a block and its items (CASCADE handles items) */
  const deleteBlock = async (blockId: string) => {
    const { error } = await supabase
      .from('estimate_blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      toast({ title: 'Fehler', description: 'Block konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  /** Copy selected blocks from one version to another */
  const copyBlocksToVersion = async (sourceVersionId: string, targetVersionId: string, blockIds: string[]) => {
    const sourcesBlocks = allBlocks.filter(b => blockIds.includes(b.id) && b.version_id === sourceVersionId);
    
    // We need a dummy architect_estimates record for the target version to hold block items
    // Check if one exists, or create one
    let targetEstimate = allEstimates.find(e => e.version_id === targetVersionId);
    if (!targetEstimate && household) {
      const { data } = await supabase
        .from('architect_estimates')
        .insert({
          household_id: household.id,
          file_path: '',
          file_name: 'Block-Container',
          version_id: targetVersionId,
          is_active: true,
          processed: true,
        })
        .select()
        .single();
      if (data) targetEstimate = data as ArchitectEstimate;
    }
    if (!targetEstimate) return false;

    for (const block of sourcesBlocks) {
      // Create new block — inherit carry_forward from source
      const { data: newBlock, error } = await supabase
        .from('estimate_blocks')
        .insert({
          version_id: targetVersionId,
          block_type: block.block_type,
          label: block.label,
          file_path: block.file_path,
          file_name: block.file_name,
          source_block_id: block.id,
          processed: block.processed,
          notes: block.notes,
          sort_order: block.sort_order,
          carry_forward: block.carry_forward,
        })
        .select()
        .single();

      if (error || !newBlock) continue;

      // Copy items from the source block
      const sourceItems = allEstimateItems.filter(i => i.block_id === block.id);
      if (sourceItems.length > 0) {
        await supabase
          .from('architect_estimate_items')
          .insert(
            sourceItems.map(item => ({
              estimate_id: targetEstimate!.id,
              block_id: newBlock.id,
              kostengruppe_code: item.kostengruppe_code,
              estimated_amount: item.estimated_amount,
              notes: item.notes,
              is_gross: item.is_gross,
              tax_status: item.tax_status || (item.is_gross ? 'gross' : 'net'),
            }))
          );
      }
    }

    await fetchEstimates();
    return true;
  };

  const updateEstimateItem = async (id: string, updates: Partial<ArchitectEstimateItem>) => {
    const { error } = await supabase
      .from('architect_estimate_items')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Position konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  const updateEstimateNotes = async (id: string, notes: string) => {
    const { error } = await supabase
      .from('architect_estimates')
      .update({ notes })
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Notiz konnte nicht gespeichert werden', variant: 'destructive' });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  const deleteEstimateItem = async (id: string) => {
    const { error } = await supabase
      .from('architect_estimate_items')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Position konnte nicht gelöscht werden',
        variant: 'destructive',
      });
      return false;
    }

    await fetchEstimates();
    return true;
  };

  const getItemsByEstimate = (estimateId: string) => {
    return allEstimateItems.filter(item => item.estimate_id === estimateId);
  };

  const getItemsByBlock = (blockId: string) => {
    return allEstimateItems.filter(item => item.block_id === blockId);
  };

  const getItemsByEstimateIds = (ids: string[]): ArchitectEstimateItem[] => {
    const idSet = new Set(ids);
    return allEstimateItems.filter(item => idSet.has(item.estimate_id));
  };

  const getAllEstimatedAmounts = () => {
    const totals: Record<string, number> = {};
    estimateItems.forEach(item => {
      totals[item.kostengruppe_code] = (totals[item.kostengruppe_code] || 0) + Number(item.estimated_amount);
    });
    return totals;
  };

  return {
    versions,
    activeVersion,
    estimates,
    allEstimates,
    allBlocks,
    activeBlocks,
    estimateItems,
    allEstimateItems,
    loading,
    fetchEstimates,
    createEstimate,
    addEstimateItems,
    setActiveVersion,
    createVersion,
    updateVersionName,
    updateEstimateItem,
    updateEstimateNotes,
    deleteEstimateItem,
    getItemsByEstimate,
    getItemsByBlock,
    getItemsByEstimateIds,
    getAllEstimatedAmounts,
    // Block CRUD
    createBlock,
    addBlockItems,
    deleteBlock,
    copyBlocksToVersion,
  };
}
