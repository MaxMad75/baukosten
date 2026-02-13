import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useConstructionJournal } from '@/hooks/useConstructionJournal';
import { useContractors } from '@/hooks/useContractors';
import { ConstructionJournalEntry } from '@/lib/types';
import {
  Plus, Loader2, Trash2, Edit, Calendar, Image, BookOpen, X, Upload
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = ['Rohbau', 'Elektro', 'Sanitär', 'Heizung', 'Ausbau', 'Außenanlagen', 'Mangel', 'Sonstiges'];

const emptyForm = {
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  title: '',
  description: '',
  category: '',
  contractor_id: '',
};

export const ConstructionJournal: React.FC = () => {
  const { entries, loading, createEntry, updateEntry, deleteEntry, uploadPhoto, getSignedPhotoUrl } = useConstructionJournal();
  const { contractors } = useContractors();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ConstructionJournalEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});

  // Load signed URLs for photos
  useEffect(() => {
    const loadUrls = async () => {
      const urls: Record<string, string[]> = {};
      for (const entry of entries) {
        if (entry.photos && entry.photos.length > 0) {
          const signed = await Promise.all(entry.photos.map((p) => getSignedPhotoUrl(p)));
          urls[entry.id] = signed.filter(Boolean) as string[];
        }
      }
      setPhotoUrls(urls);
    };
    if (entries.length > 0) loadUrls();
  }, [entries]);

  const resetForm = () => { setFormData(emptyForm); setPendingPhotos([]); };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingPhotos((prev) => [...prev, ...files]);
  };

  const removePendingPhoto = (index: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!formData.title || !formData.description || !formData.entry_date) return;
    setUploading(true);

    // Upload photos first
    const photoPaths: string[] = [];
    for (const file of pendingPhotos) {
      const path = await uploadPhoto(file);
      if (path) photoPaths.push(path);
    }

    await createEntry({
      entry_date: formData.entry_date,
      title: formData.title,
      description: formData.description,
      category: formData.category || undefined,
      contractor_id: formData.contractor_id || undefined,
      photos: photoPaths.length > 0 ? photoPaths : undefined,
    });

    setUploading(false);
    resetForm();
    setIsCreateOpen(false);
  };

  const openEdit = (entry: ConstructionJournalEntry) => {
    setEditingEntry(entry);
    setFormData({
      entry_date: entry.entry_date,
      title: entry.title,
      description: entry.description,
      category: entry.category || '',
      contractor_id: entry.contractor_id || '',
    });
    setPendingPhotos([]);
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingEntry || !formData.title || !formData.description) return;
    setUploading(true);

    // Upload new photos
    const newPaths: string[] = [];
    for (const file of pendingPhotos) {
      const path = await uploadPhoto(file);
      if (path) newPaths.push(path);
    }

    const allPhotos = [...(editingEntry.photos || []), ...newPaths];

    await updateEntry(editingEntry.id, {
      entry_date: formData.entry_date,
      title: formData.title,
      description: formData.description,
      category: formData.category || null,
      contractor_id: formData.contractor_id || null,
      photos: allPhotos.length > 0 ? allPhotos : null,
    });

    setUploading(false);
    setIsEditOpen(false);
    setEditingEntry(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteEntry(deleteId);
    setDeleteId(null);
  };

  const filtered = entries.filter((e) => filterCategory === 'all' || e.category === filterCategory);

  const getContractorName = (id: string | null) => {
    if (!id) return null;
    return contractors.find((c) => c.id === id)?.company_name || null;
  };

  const categoryColor = (cat: string | null) => {
    const colors: Record<string, string> = {
      Rohbau: 'bg-orange-100 text-orange-800',
      Elektro: 'bg-yellow-100 text-yellow-800',
      Sanitär: 'bg-blue-100 text-blue-800',
      Heizung: 'bg-red-100 text-red-800',
      Ausbau: 'bg-green-100 text-green-800',
      Außenanlagen: 'bg-emerald-100 text-emerald-800',
      Mangel: 'bg-destructive/10 text-destructive',
      Sonstiges: 'bg-muted text-muted-foreground',
    };
    return cat ? colors[cat] || 'bg-muted text-muted-foreground' : '';
  };

  const EntryForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Datum *</Label>
          <Input type="date" value={formData.entry_date} onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Kategorie</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
            <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Titel *</Label>
          <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="z.B. Elektroinstallation Erdgeschoss" />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Beschreibung *</Label>
          <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Was wurde heute gemacht?" rows={4} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Firma</Label>
          <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
            <SelectTrigger><SelectValue placeholder="Firma zuordnen (optional)" /></SelectTrigger>
            <SelectContent>
              {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Fotos</Label>
          <input type="file" ref={fileInputRef} multiple accept="image/*" onChange={handlePhotoSelect} className="hidden" />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />Fotos hinzufügen
          </Button>
          {pendingPhotos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingPhotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded-md object-cover" />
                  <button onClick={() => removePendingPhoto(i)} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { resetForm(); setIsCreateOpen(false); setIsEditOpen(false); }}>Abbrechen</Button>
        <Button onClick={onSubmit} disabled={uploading}>
          {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
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
            <h1 className="text-3xl font-bold">Bautagebuch</h1>
            <p className="text-muted-foreground">Dokumentieren Sie den Baufortschritt</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Neuer Eintrag</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Neuer Tagebucheintrag</DialogTitle>
                <DialogDescription>Dokumentieren Sie den heutigen Baufortschritt.</DialogDescription>
              </DialogHeader>
              <EntryForm onSubmit={handleCreate} submitLabel="Eintrag erstellen" />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex gap-4">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Alle Kategorien" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Keine Einträge vorhanden</p>
              <p className="text-muted-foreground">Erstellen Sie Ihren ersten Tagebucheintrag.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(entry.entry_date), 'dd. MMMM yyyy', { locale: de })}
                        </div>
                        {entry.category && (
                          <Badge variant="secondary" className={categoryColor(entry.category)}>
                            {entry.category}
                          </Badge>
                        )}
                        {getContractorName(entry.contractor_id) && (
                          <Badge variant="outline">{getContractorName(entry.contractor_id)}</Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold">{entry.title}</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.description}</p>

                      {/* Photos */}
                      {photoUrls[entry.id] && photoUrls[entry.id].length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {photoUrls[entry.id].map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt="" className="h-24 w-24 rounded-md object-cover transition-transform hover:scale-105" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(entry.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingEntry(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eintrag bearbeiten</DialogTitle>
            <DialogDescription>Aktualisieren Sie den Tagebucheintrag.</DialogDescription>
          </DialogHeader>
          <EntryForm onSubmit={handleUpdate} submitLabel="Speichern" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
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

export default ConstructionJournal;
