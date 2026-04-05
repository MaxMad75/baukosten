import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArchitectEstimate, ArchitectEstimateItem, EstimateVersion } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useEstimates() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [allEstimates, setAllEstimates] = useState<ArchitectEstimate[]>([]);
  const [allEstimateItems, setAllEstimateItems] = useState<ArchitectEstimateItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Derived: active version
  const activeVersion = versions.find(v => v.is_active) || null;

  // Derived: estimates linked to active version
  const estimates = allEstimates.filter(e => activeVersion && e.version_id === activeVersion.id);

  // Derived: items from active version's estimates
  const activeEstimateIds = new Set(estimates.map(e => e.id));
  const estimateItems = allEstimateItems.filter(i => activeEstimateIds.has(i.estimate_id));

  const fetchEstimates = async () => {
    if (!household) return;

    setLoading(true);

    // Fetch versions and estimates in parallel
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

    // Fetch all items
    const estimateIds = fetchedEstimates.map(e => e.id);
    if (estimateIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('architect_estimate_items')
        .select('*')
        .in('estimate_id', estimateIds);

      setAllEstimateItems((itemsData || []) as ArchitectEstimateItem[]);
    } else {
      setAllEstimateItems([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchEstimates();
  }, [household]);

  /** Activate a specific version, deactivate all others, sync architect_estimates.is_active */
  const setActiveVersion = async (versionId: string) => {
    if (!household) return false;

    // Deactivate all versions for household
    await supabase
      .from('estimate_versions')
      .update({ is_active: false })
      .eq('household_id', household.id);

    // Activate selected version
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
      // Deactivate all estimates linked to any version in this household
      await supabase
        .from('architect_estimates')
        .update({ is_active: false })
        .in('version_id', allVersionIds);

      // Activate estimates linked to the selected version
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

    // Deactivate all existing versions
    if (versions.length > 0) {
      await supabase
        .from('estimate_versions')
        .update({ is_active: false })
        .eq('household_id', household.id);

      // Sync: deactivate all linked estimates
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

  /** Create an estimate record within a version */
  const createEstimate = async (filePath: string, fileName: string, versionId?: string) => {
    if (!household) return null;

    // If no versionId provided, use active version or create one
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

  const addEstimateItems = async (estimateId: string, items: Array<{ kostengruppe_code: string; estimated_amount: number; notes?: string; is_gross?: boolean }>) => {
    const { error } = await supabase
      .from('architect_estimate_items')
      .insert(
        items.map(item => ({
          estimate_id: estimateId,
          kostengruppe_code: item.kostengruppe_code,
          estimated_amount: item.estimated_amount,
          notes: item.notes || null,
          is_gross: item.is_gross ?? false,
        }))
      );

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Kostenpositionen konnten nicht hinzugefügt werden',
        variant: 'destructive',
      });
      return false;
    }

    // Mark estimate as processed
    await supabase
      .from('architect_estimates')
      .update({ processed: true })
      .eq('id', estimateId);

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
    getItemsByEstimateIds,
    getAllEstimatedAmounts,
  };
}
