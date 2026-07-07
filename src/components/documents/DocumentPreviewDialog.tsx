import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, FileText } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string | null;
  /** Signed URL; null while it is being fetched */
  url: string | null;
}

const ext = (name: string) => name.substring(name.lastIndexOf('.')).toLowerCase();
const isPdf = (name: string) => ext(name) === '.pdf';
const isImage = (name: string) => ['.jpg', '.jpeg', '.png'].includes(ext(name));

/** Inline preview for PDFs and images; other types offer opening externally. */
export const DocumentPreviewDialog: React.FC<Props> = ({ open, onOpenChange, fileName, url }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="truncate pr-8">{fileName || 'Vorschau'}</DialogTitle>
        <DialogDescription className="sr-only">Dokumentvorschau</DialogDescription>
      </DialogHeader>
      <div className="flex-1 min-h-0">
        {!url || !fileName ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isPdf(fileName) ? (
          <iframe src={url} title={fileName} className="h-full w-full rounded-md border" />
        ) : isImage(fileName) ? (
          <div className="flex h-full items-center justify-center overflow-auto">
            <img src={url} alt={fileName} className="max-h-full max-w-full object-contain rounded-md" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Für diesen Dateityp gibt es keine Inline-Vorschau.</p>
            <Button variant="outline" onClick={() => window.open(url, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" /> In neuem Tab öffnen
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
