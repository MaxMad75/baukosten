import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArchitectEstimate, ArchitectEstimateItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useEstimates() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<ArchitectEstimate[]>([]);
  const [allEstimates, setAllEstimates] = useState<ArchitectEstimate[]>([]);
  const [estimateItems, setEstimateItems] = useState<ArchitectEstimateItem[]>([]);
  const [activeEstimateItems, setActiveEstimateItems] = useState<ArchitectEstimateItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEstimates = async () => {
    if (!household) return;

    setLoading(true);
    const { data: estimatesData } = await supabase
      .from('architect_estimates')
      .select('*')
      .eq('household_id', household.id)
      .order('uploaded_at', { ascending: false });

    if (estimatesData) {
      const all = estimatesData as ArchitectEstimate[];
      setAllEstimates(all);
      // Active estimates for display (show only active or root with no versions)
      setEstimates(all.filter(e => e.is_active));

      // Fetch all items for all estimates
      const estimateIds = estimatesData.map(e => e.id);
      if (estimateIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('architect_estimate_items')
          .select('*')
          .in('estimate_id', estimateIds);

        if (itemsData) {
          const items = itemsData as ArchitectEstimateItem[];
          setEstimateItems(items);
          // Only items from active estimates for Soll calculations
          const activeIds = new Set(all.filter(e => e.is_active).map(e => e.id));
          setActiveEstimateItems(items.filter(i => activeIds.has(i.estimate_id)));
        }
      } else {
        setEstimateItems([]);
        setActiveEstimateItems([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEstimates();
  }, [household]);

  const createEstimate = async (filePath: string, fileName: string, parentId?: string, versionNumber?: number) => {
    if (!household) return null;

    const { data, error } = await supabase
      .from('architect_estimates')
      .insert({
        household_id: household.id,
        file_path: filePath,
        file_name: fileName,
        parent_id: parentId || null,
        version_number: versionNumber || 1,
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

  /** Replace an existing estimate with a new version. Deactivates the old one. */
  const replaceEstimate = async (oldEstimateId: string, filePath: string, fileName: string) => {
    if (!household) return null;

    const oldEstimate = allEstimates.find(e => e.id === oldEstimateId);
    if (!oldEstimate) return null;

    // Determine root parent and next version number
    const rootId = oldEstimate.parent_id || oldEstimate.id;
    const siblings = allEstimates.filter(e => e.id === rootId || e.parent_id === rootId);
    const maxVersion = Math.max(...siblings.map(e => e.version_number));

    // Deactivate all versions in the family
    const familyIds = siblings.map(e => e.id);
    await supabase
      .from('architect_estimates')
      .update({ is_active: false })
      .in('id', familyIds);

    // Create new version
    const newEstimate = await createEstimate(filePath, fileName, rootId, maxVersion + 1);
    return newEstimate;
  };

  /** Get all versions of an estimate (by its family/root) */
  const getVersions = (estimateId: string): ArchitectEstimate[] => {
    const est = allEstimates.find(e => e.id === estimateId);
    if (!est) return [];
    const rootId = est.parent_id || est.id;
    return allEstimates
      .filter(e => e.id === rootId || e.parent_id === rootId)
      .sort((a, b) => a.version_number - b.version_number);
  };

  /** Activate a specific version and deactivate all others in the family */
  const setActiveVersion = async (estimateId: string) => {
    const versions = getVersions(estimateId);
    if (versions.length === 0) return false;

    const familyIds = versions.map(e => e.id);
    // Deactivate all
    await supabase
      .from('architect_estimates')
      .update({ is_active: false })
      .in('id', familyIds);

    // Activate selected
    const { error } = await supabase
      .from('architect_estimates')
      .update({ is_active: true })
      .eq('id', estimateId);

    if (error) {
      toast({ title: 'Fehler', description: 'Version konnte nicht aktiviert werden', variant: 'destructive' });
      return false;
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
    return estimateItems.filter(item => item.estimate_id === estimateId);
  };

  const getItemsByEstimateIds = (ids: string[]): ArchitectEstimateItem[] => {
    const idSet = new Set(ids);
    return estimateItems.filter(item => idSet.has(item.estimate_id));
  };

  const getAllEstimatedAmounts = () => {
    const totals: Record<string, number> = {};
    activeEstimateItems.forEach(item => {
      totals[item.kostengruppe_code] = (totals[item.kostengruppe_code] || 0) + Number(item.estimated_amount);
    });
    return totals;
  };

  return {
    estimates,
    allEstimates,
    estimateItems: activeEstimateItems, // Only active items for Soll calculations
    allEstimateItems: estimateItems,
    loading,
    fetchEstimates,
    createEstimate,
    addEstimateItems,
    replaceEstimate,
    getVersions,
    setActiveVersion,
    updateEstimateItem,
    updateEstimateNotes,
    deleteEstimateItem,
    getItemsByEstimate,
    getItemsByEstimateIds,
    getAllEstimatedAmounts,
  };
}
