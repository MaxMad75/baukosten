import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DIN276Kostengruppe } from '@/lib/types';

export function useKostengruppen() {
  const [kostengruppen, setKostengruppen] = useState<DIN276Kostengruppe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKostengruppen = async () => {
      const { data, error } = await supabase
        .from('din276_kostengruppen')
        .select('*')
        .order('code');

      if (!error && data) {
        setKostengruppen(data as DIN276Kostengruppe[]);
      }
      setLoading(false);
    };

    fetchKostengruppen();
  }, []);

  const getKostengruppeByCode = (code: string) => {
    return kostengruppen.find(kg => kg.code === code);
  };

  const getKostengruppenByLevel = (level: number) => {
    return kostengruppen.filter(kg => kg.level === level);
  };

  const getChildKostengruppen = (parentCode: string) => {
    return kostengruppen.filter(kg => kg.parent_code === parentCode);
  };

  const getHierarchy = () => {
    const level1 = getKostengruppenByLevel(1);
    return level1.map(l1 => ({
      ...l1,
      children: getChildKostengruppen(l1.code).map(l2 => ({
        ...l2,
        children: getChildKostengruppen(l2.code),
      })),
    }));
  };

  return {
    kostengruppen,
    loading,
    getKostengruppeByCode,
    getKostengruppenByLevel,
    getChildKostengruppen,
    getHierarchy,
  };
}
