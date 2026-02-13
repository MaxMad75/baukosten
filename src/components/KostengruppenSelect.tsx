import React, { useMemo, useState } from 'react';
import { useKostengruppen } from '@/hooks/useKostengruppen';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [open, setOpen] = useState(false);

  const hierarchy = useMemo(() => getHierarchy(), [kostengruppen]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const found = kostengruppen.find(kg => kg.code === value);
    return found ? `${found.code} - ${found.name}` : value;
  }, [value, kostengruppen]);

  if (loading) {
    return (
      <Button variant="outline" disabled className="w-full justify-between">
        Laden...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(value, search) => {
          const label = value.toLowerCase();
          const s = search.toLowerCase();
          return label.includes(s) ? 1 : 0;
        }}>
          <CommandInput placeholder="Suchen..." />
          <CommandList>
            <CommandEmpty>Keine Kostengruppe gefunden.</CommandEmpty>
            {hierarchy.map((level1) => (
              <CommandGroup key={level1.code} heading={`${level1.code} - ${level1.name}`}>
                {level1.children?.map((level2) => (
                  <React.Fragment key={level2.code}>
                    <CommandItem
                      value={`${level2.code} - ${level2.name}`}
                      onSelect={() => {
                        onValueChange(level2.code);
                        setOpen(false);
                      }}
                      className="font-medium"
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === level2.code ? 'opacity-100' : 'opacity-0')} />
                      {level2.code} - {level2.name}
                    </CommandItem>
                    {level2.children?.map((level3) => (
                      <CommandItem
                        key={level3.code}
                        value={`${level3.code} - ${level3.name}`}
                        onSelect={() => {
                          onValueChange(level3.code);
                          setOpen(false);
                        }}
                        className="pl-8"
                      >
                        <Check className={cn('mr-2 h-4 w-4', value === level3.code ? 'opacity-100' : 'opacity-0')} />
                        {level3.code} - {level3.name}
                      </CommandItem>
                    ))}
                  </React.Fragment>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
