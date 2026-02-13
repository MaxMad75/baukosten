import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useDocuments, Document } from '@/hooks/useDocuments';
import { Search, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface EstimateDocumentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (doc: Document) => void;
  loading?: boolean;
}

export const EstimateDocumentPicker: React.FC<EstimateDocumentPickerProps> = ({
  open,
  onOpenChange,
  onSelect,
  loading = false,
}) => {
  const { documents, loading: docsLoading } = useDocuments();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (d) =>
        d.file_name.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.document_type || '').toLowerCase().includes(q)
    );
  }, [documents, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dokument auswählen</DialogTitle>
          <DialogDescription>
            Wählen Sie ein bereits hochgeladenes Dokument zur Analyse als Kostenschätzung.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Dokument suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[350px]">
          {docsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">Keine Dokumente gefunden</p>
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {filtered.map((doc) => (
                <button
                  key={doc.id}
                  disabled={loading}
                  onClick={() => onSelect(doc)}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title || doc.file_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{doc.file_name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {doc.document_type && (
                        <Badge variant="secondary" className="text-xs">
                          {doc.document_type}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(doc.created_at), 'dd.MM.yyyy', { locale: de })}
                      </span>
                    </div>
                  </div>
                  {loading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <span className="shrink-0 text-xs text-primary">Analysieren</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
