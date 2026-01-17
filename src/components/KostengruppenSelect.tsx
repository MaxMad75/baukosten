import React, { useMemo } from 'react';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface KostengruppenSelectProps {
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export const KostengruppenSelect: React.FC<KostengruppenSelectProps> = ({
  value,
  onValueChange,
  placeholder = 'Kostengruppe wählen...',
}) => {
  const { kostengruppen, loading, getHierarchy } = useKostengruppen();

  const hierarchy = useMemo(() => getHierarchy(), [kostengruppen]);

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Laden..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value || ''} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {hierarchy.map((level1) => (
          <SelectGroup key={level1.code}>
            <SelectLabel className="font-bold text-foreground">
              {level1.code} - {level1.name}
            </SelectLabel>
            <SelectItem value={level1.code} className="pl-4">
              {level1.code} - {level1.name}
            </SelectItem>
            {level1.children?.map((level2) => (
              <React.Fragment key={level2.code}>
                <SelectItem value={level2.code} className="pl-6 font-medium">
                  {level2.code} - {level2.name}
                </SelectItem>
                {level2.children?.map((level3) => (
                  <SelectItem key={level3.code} value={level3.code} className="pl-8">
                    {level3.code} - {level3.name}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};
