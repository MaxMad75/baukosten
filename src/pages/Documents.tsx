import React, { useState, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useDocuments, Document } from '@/hooks/useDocuments';
import { useContractors } from '@/hooks/useContractors';
import { extractTextFromPDF } from '@/utils/pdfExtractor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Loader2, Trash2, Edit, Search, FileText, Upload, Download, FolderOpen, Sparkles, ExternalLink
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const DOCUMENT_TYPES = ['Vertrag', 'Genehmigung', 'Angebot', 'Zeichnung', 'Rechnung', 'Protokoll', 'Sonstiges'];

const typeColors: Record<string, string> = {
  Vertrag: 'bg-blue-100 text-blue-800',
  Genehmigung: 'bg-green-100 text-green-800',
  Angebot: 'bg-yellow-100 text-yellow-800',
  Zeichnung: 'bg-purple-100 text-purple-800',
  Rechnung: 'bg-orange-100 text-orange-800',
  Protokoll: 'bg-cyan-100 text-cyan-800',
  Sonstiges: 'bg-muted text-muted-foreground',
};

const emptyForm = { title: '', document_type: '', description: '', contractor_id: '' };

export const Documents: React.FC = () => {
  const { documents, loading, uploadDocument, createDocument, updateDocument, deleteDocument, getDocumentUrl } = useDocuments();
  const { contractors } = useContractors();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; name: string; size: number } | null>(null);

  const resetForm = () => { setFormData(emptyForm); setUploadedFile(null); };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadDocument(file);
      if (!result) { setUploading(false); return; }
      setUploadedFile(result);

      // Try AI analysis for PDFs
      if (file.name.toLowerCase().endsWith('.pdf')) {
        setAnalyzing(true);
        try {
          const pdfText = await extractTextFromPDF(file);
          const { data: functionData, error: functionError } = await supabase.functions.invoke('analyze-document', {
            body: { textContent: pdfText, fileName: file.name }
          });

          if (!functionError && functionData?.data) {
            const ai = functionData.data;
            setFormData({
              title: ai.title || file.name,
              document_type: ai.document_type || '',
              description: ai.description || '',
              contractor_id: '',
            });

            // Try to match contractor by company name
            if (ai.company_name) {
              const match = contractors.find(
                (c) => c.company_name.toLowerCase().includes(ai.company_name.toLowerCase()) ||
                  ai.company_name.toLowerCase().includes(c.company_name.toLowerCase())
              );
              if (match) {
                setFormData((prev) => ({ ...prev, contractor_id: match.id }));
              }
            }

            toast({ title: 'KI-Analyse abgeschlossen', description: 'Bitte überprüfen Sie die erkannten Daten.' });
          } else {
            setFormData((prev) => ({ ...prev, title: file.name }));
          }
        } catch {
          setFormData((prev) => ({ ...prev, title: file.name }));
        }
        setAnalyzing(false);
      } else {
        setFormData((prev) => ({ ...prev, title: file.name }));
      }
    } catch {
      toast({ title: 'Fehler', description: 'Datei konnte nicht hochgeladen werden', variant: 'destructive' });
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    if (!uploadedFile || !formData.title) return;
    await createDocument({
      file_path: uploadedFile.path,
      file_name: uploadedFile.name,
      file_size: uploadedFile.size,
      title: formData.title,
      document_type: formData.document_type || undefined,
      description: formData.description || undefined,
      contractor_id: formData.contractor_id || undefined,
      ai_analyzed: analyzing || !!formData.description,
    });
    resetForm();
    setIsUploadOpen(false);
  };

  const openEdit = (doc: Document) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      document_type: doc.document_type || '',
      description: doc.description || '',
      contractor_id: doc.contractor_id || '',
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingDoc || !formData.title) return;
    await updateDocument(editingDoc.id, {
      title: formData.title,
      document_type: formData.document_type || null,
      description: formData.description || null,
      contractor_id: formData.contractor_id || null,
    });
    setIsEditOpen(false);
    setEditingDoc(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteDocument(deleteId);
    setDeleteId(null);
  };

  const handleDownload = async (doc: Document) => {
    const url = await getDocumentUrl(doc.file_path);
    if (url) window.open(url, '_blank');
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '–';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filtered = documents.filter((d) => {
    const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || d.document_type === filterType;
    return matchSearch && matchType;
  });

  const getContractorName = (id: string | null) => {
    if (!id) return null;
    return contractors.find((c) => c.id === id)?.company_name || null;
  };

  const DocumentForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="col-span-2 space-y-2">
          <Label>Titel *</Label>
          <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Dokumenttitel" />
        </div>
        <div className="space-y-2">
          <Label>Dokumenttyp</Label>
          <Select value={formData.document_type} onValueChange={(v) => setFormData({ ...formData, document_type: v })}>
            <SelectTrigger><SelectValue placeholder="Typ wählen" /></SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Firma zuordnen</Label>
          <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
            <SelectTrigger><SelectValue placeholder="Firma wählen (optional)" /></SelectTrigger>
            <SelectContent>
              {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Beschreibung</Label>
          <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Kurze Beschreibung des Dokuments" rows={3} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { resetForm(); setIsUploadOpen(false); setIsEditOpen(false); }}>Abbrechen</Button>
        <Button onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dokumente</h1>
            <p className="text-muted-foreground">Alle Baudokumente an einem Ort</p>
          </div>
          <Dialog open={isUploadOpen} onOpenChange={(o) => { setIsUploadOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Upload className="mr-2 h-4 w-4" />Dokument hochladen</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Dokument hochladen</DialogTitle>
                <DialogDescription>
                  Laden Sie ein Dokument hoch. PDFs werden automatisch per KI analysiert.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!uploadedFile && (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8">
                    <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                    {uploading || analyzing ? (
                      <div className="text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          {analyzing ? (
                            <span className="flex items-center justify-center gap-1">
                              <Sparkles className="h-4 w-4" /> KI analysiert Dokument...
                            </span>
                          ) : 'Hochladen...'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <FolderOpen className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">PDF, Word, Excel oder Bild hierher ziehen</p>
                        <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>Datei auswählen</Button>
                      </>
                    )}
                  </div>
                )}

                {uploadedFile && (
                  <>
                    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      ✓ Datei hochgeladen: {uploadedFile.name} ({formatFileSize(uploadedFile.size)})
                    </div>
                    <DocumentForm onSubmit={handleCreate} submitLabel="Dokument speichern" />
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder="Suche nach Titel, Beschreibung oder Dateiname..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Alle Typen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Keine Dokumente vorhanden</p>
              <p className="text-muted-foreground">Laden Sie Ihr erstes Dokument hoch.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead className="hidden md:table-cell">Typ</TableHead>
                    <TableHead className="hidden lg:table-cell">Firma</TableHead>
                    <TableHead className="hidden md:table-cell">Größe</TableHead>
                    <TableHead className="hidden lg:table-cell">Datum</TableHead>
                    <TableHead className="w-32">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{doc.title}</span>
                            {doc.ai_analyzed && <Sparkles className="h-3 w-3 text-primary" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{doc.file_name}</div>
                          {doc.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{doc.description}</div>}
                          <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                            {doc.document_type && <Badge variant="secondary" className={typeColors[doc.document_type] || ''}>{doc.document_type}</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {doc.document_type ? (
                          <Badge variant="secondary" className={typeColors[doc.document_type] || ''}>{doc.document_type}</Badge>
                        ) : '–'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{getContractorName(doc.contractor_id) || '–'}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {format(new Date(doc.created_at), 'dd.MM.yyyy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Herunterladen">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(doc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingDoc(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dokument bearbeiten</DialogTitle>
            <DialogDescription>Aktualisieren Sie die Dokumentdetails.</DialogDescription>
          </DialogHeader>
          <DocumentForm onSubmit={handleUpdate} submitLabel="Speichern" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Dokument wird unwiderruflich gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Documents;
