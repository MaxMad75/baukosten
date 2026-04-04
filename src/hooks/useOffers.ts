import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Offer, OfferItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function useOffers() {
  const { household, profile } = useAuth();
  const { toast } = useToast();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allOfferItems, setAllOfferItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOffers = async () => {
    if (!household) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Fehler', description: 'Angebote konnten nicht geladen werden', variant: 'destructive' });
    } else {
      setOffers((data as unknown as Offer[]) || []);
    }
    setLoading(false);
  };

  const fetchAllOfferItems = async (offerIds: string[]) => {
    if (offerIds.length === 0) {
      setAllOfferItems([]);
      return;
    }
    const { data, error } = await supabase
      .from('offer_items')
      .select('*')
      .in('offer_id', offerIds);

    if (!error && data) {
      setAllOfferItems((data as unknown as OfferItem[]) || []);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, [household]);

  const createOffer = async (data: {
    company_name: string;
    title: string;
    offer_date?: string;
    contractor_id?: string;
    document_id?: string;
    is_gross?: boolean;
    notes?: string;
  }) => {
    if (!household) return null;
    const { data: result, error } = await supabase
      .from('offers')
      .insert({
        household_id: household.id,
        company_name: data.company_name,
        title: data.title,
        offer_date: data.offer_date || null,
        contractor_id: data.contractor_id || null,
        document_id: data.document_id || null,
        is_gross: data.is_gross ?? true,
        notes: data.notes || null,
        created_by_profile_id: profile?.id || null,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: 'Fehler', description: 'Angebot konnte nicht erstellt werden', variant: 'destructive' });
      return null;
    }
    await fetchOffers();
    toast({ title: 'Erfolg', description: 'Angebot wurde erstellt' });
    return result as unknown as Offer;
  };

  const updateOffer = async (id: string, updates: Partial<Offer>) => {
    const { error } = await supabase
      .from('offers')
      .update(updates as any)
      .eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Angebot konnte nicht aktualisiert werden', variant: 'destructive' });
      return false;
    }
    await fetchOffers();
    toast({ title: 'Erfolg', description: 'Angebot wurde aktualisiert' });
    return true;
  };

  const deleteOffer = async (id: string) => {
    // Delete items first
    await supabase.from('offer_items').delete().eq('offer_id', id);
    const { error } = await supabase.from('offers').delete().eq('id', id);

    if (error) {
      toast({ title: 'Fehler', description: 'Angebot konnte nicht gelöscht werden', variant: 'destructive' });
      return false;
    }
    await fetchOffers();
    toast({ title: 'Erfolg', description: 'Angebot wurde gelöscht' });
    return true;
  };

  const fetchOfferItems = async (offerId: string): Promise<OfferItem[]> => {
    const { data, error } = await supabase
      .from('offer_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('kostengruppe_code');

    if (error) {
      toast({ title: 'Fehler', description: 'Angebotspositionen konnten nicht geladen werden', variant: 'destructive' });
      return [];
    }
    return (data as unknown as OfferItem[]) || [];
  };

  const saveOfferItems = async (offerId: string, items: Array<{ kostengruppe_code: string; amount: number; description?: string; is_gross?: boolean }>) => {
    // Delete existing items
    await supabase.from('offer_items').delete().eq('offer_id', offerId);

    if (items.length > 0) {
      const { error } = await supabase
        .from('offer_items')
        .insert(items.map(item => ({
          offer_id: offerId,
          kostengruppe_code: item.kostengruppe_code,
          amount: item.amount,
          description: item.description || null,
          is_gross: item.is_gross ?? true,
        })) as any);

      if (error) {
        toast({ title: 'Fehler', description: 'Angebotspositionen konnten nicht gespeichert werden', variant: 'destructive' });
        return false;
      }
    }

    // Update total on offer
    const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    await supabase.from('offers').update({ total_amount: total } as any).eq('id', offerId);
    await fetchOffers();
    toast({ title: 'Erfolg', description: 'Angebotspositionen gespeichert' });
    return true;
  };

  return { offers, loading, fetchOffers, createOffer, updateOffer, deleteOffer, fetchOfferItems, saveOfferItems };
}
