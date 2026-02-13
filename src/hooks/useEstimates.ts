import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArchitectEstimate, ArchitectEstimateItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useEstimates() {
  const { household } = useAuth();
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<ArchitectEstimate[]>([]);
  const [estimateItems, setEstimateItems] = useState<ArchitectEstimateItem[]>([]);
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
      setEstimates(estimatesData as ArchitectEstimate[]);

      // Fetch all items for these estimates
      const estimateIds = estimatesData.map(e => e.id);
      if (estimateIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('architect_estimate_items')
          .select('*')
          .in('estimate_id', estimateIds);

        if (itemsData) {
          setEstimateItems(itemsData as ArchitectEstimateItem[]);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEstimates();
  }, [household]);

  const createEstimate = async (filePath: string, fileName: string) => {
    if (!household) return null;

    const { data, error } = await supabase
      .from('architect_estimates')
      .insert({
        household_id: household.id,
        file_path: filePath,
        file_name: fileName,
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

  const getAllEstimatedAmounts = () => {
    const totals: Record<string, number> = {};
    estimateItems.forEach(item => {
      totals[item.kostengruppe_code] = (totals[item.kostengruppe_code] || 0) + Number(item.estimated_amount);
    });
    return totals;
  };

  return {
    estimates,
    estimateItems,
    loading,
    fetchEstimates,
    createEstimate,
    addEstimateItems,
    updateEstimateItem,
    deleteEstimateItem,
    getItemsByEstimate,
    getAllEstimatedAmounts,
  };
}
