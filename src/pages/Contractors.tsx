import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useContractors } from '@/hooks/useContractors';
import { useInvoices } from '@/hooks/useInvoices';
import { Contractor } from '@/lib/types';
import {
  Plus, Loader2, Trash2, Edit, Star, Phone, Mail, Globe, User, Search, Building2
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TRADES = [
  'Architekt', 'Bauunternehmen', 'Dachdecker', 'Elektriker', 'Estrichleger',
  'Fliesenleger', 'Gerüstbau', 'Heizung/Sanitär', 'Maler', 'Maurer',
  'Schreiner/Tischler', 'Tiefbau', 'Trockenbau', 'Zimmerer', 'Sonstige',
];

const emptyForm = {
  company_name: '', trade: '', contact_person: '', phone: '', email: '', website: '', notes: '', rating: 0,
};

export const Contractors: React.FC = () => {
  const { contractors, loading, createContractor, updateContractor, deleteContractor } = useContractors();
  const { invoices } = useInvoices();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  const resetForm = () => setFormData(emptyForm);

  const handleCreate = async () => {
    if (!formData.company_name) return;
    const result = await createContractor({
      company_name: formData.company_name,
      trade: formData.trade || undefined,
      contact_person: formData.contact_person || undefined,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      website: formData.website || undefined,
      notes: formData.notes || undefined,
      rating: formData.rating || undefined,
    });
    if (result) { resetForm(); setIsCreateOpen(false); }
  };

  const openEdit = (c: Contractor) => {
    setEditingContractor(c);
    setFormData({
      company_name: c.company_name,
      trade: c.trade || '',
      contact_person: c.contact_person || '',
      phone: c.phone || '',
      email: c.email || '',
      website: c.website || '',
      notes: c.notes || '',
      rating: c.rating || 0,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingContractor || !formData.company_name) return;
    const success = await updateContractor(editingContractor.id, {
      company_name: formData.company_name,
      trade: formData.trade || null,
      contact_person: formData.contact_person || null,
      phone: formData.phone || null,
      email: formData.email || null,
      website: formData.website || null,
      notes: formData.notes || null,
      rating: formData.rating || null,
    });
    if (success) { setIsEditOpen(false); setEditingContractor(null); resetForm(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteContractor(deleteId);
    setDeleteId(null);
  };

  const filtered = contractors.filter((c) => {
    const matchSearch = c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.contact_person || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.trade || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchTrade = filterTrade === 'all' || c.trade === filterTrade;
    return matchSearch && matchTrade;
  });

  const RatingStars = ({ rating, onRate }: { rating: number; onRate?: (r: number) => void }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'} ${onRate ? 'cursor-pointer' : ''}`}
          onClick={() => onRate?.(i)}
        />
      ))}
    </div>
  );

  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    if (!invoiceId) return;
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) {
      setFormData(prev => ({
        ...prev,
        company_name: inv.company_name,
        notes: inv.description || prev.notes,
      }));
    }
  };

  const formFields = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Firmenname *</Label>
        <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="z.B. Elektro Müller GmbH" />
      </div>
      <div className="space-y-2">
        <Label>Gewerk</Label>
        <Select value={formData.trade} onValueChange={(v) => setFormData({ ...formData, trade: v })}>
          <SelectTrigger><SelectValue placeholder="Gewerk wählen" /></SelectTrigger>
          <SelectContent>
            {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Ansprechpartner</Label>
        <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} placeholder="Vor- und Nachname" />
      </div>
      <div className="space-y-2">
        <Label>Telefon</Label>
        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+49 123 456789" />
      </div>
      <div className="space-y-2">
        <Label>E-Mail</Label>
        <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="info@firma.de" />
      </div>
      <div className="space-y-2">
        <Label>Website</Label>
        <Input value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="www.firma.de" />
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Bewertung</Label>
        <RatingStars rating={formData.rating} onRate={(r) => setFormData({ ...formData, rating: r })} />
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Notizen</Label>
        <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="z.B. sehr zuverlässig, guter Preis..." />
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
            <h1 className="text-3xl font-bold">Firmen & Handwerker</h1>
            <p className="text-muted-foreground">Verwalten Sie Ihre Baufirmen und Handwerker</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Neue Firma</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Neue Firma hinzufügen</DialogTitle>
                <DialogDescription>Erfassen Sie die Kontaktdaten der Firma.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {invoices.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                    <Label className="text-xs text-muted-foreground">Daten aus Rechnung übernehmen (optional)</Label>
                    <Select value={selectedInvoiceId} onValueChange={handleInvoiceSelect}>
                      <SelectTrigger><SelectValue placeholder="Rechnung auswählen..." /></SelectTrigger>
                      <SelectContent>
                        {invoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.company_name} – {new Date(inv.invoice_date).toLocaleDateString('de-DE')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formFields}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { resetForm(); setSelectedInvoiceId(''); setIsCreateOpen(false); }}>Abbrechen</Button>
                  <Button onClick={handleCreate}>Firma hinzufügen</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder="Suche nach Firma, Kontakt oder Gewerk..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={filterTrade} onValueChange={setFilterTrade}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Alle Gewerke" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gewerke</SelectItem>
              {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Keine Firmen vorhanden</p>
              <p className="text-muted-foreground">Fügen Sie Ihre erste Firma hinzu.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Firma</TableHead>
                    <TableHead className="hidden md:table-cell">Gewerk</TableHead>
                    <TableHead className="hidden lg:table-cell">Kontakt</TableHead>
                    <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                    <TableHead className="hidden md:table-cell">Bewertung</TableHead>
                    <TableHead className="w-24">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{c.company_name}</div>
                          <div className="text-sm text-muted-foreground md:hidden">{c.trade}</div>
                          {c.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground lg:hidden">
                              <Mail className="h-3 w-3" />{c.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.trade || '–'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {c.contact_person && <div className="flex items-center gap-1"><User className="h-3 w-3" />{c.contact_person}</div>}
                        {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</div>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {c.phone ? <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</div> : '–'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {c.rating ? <RatingStars rating={c.rating} /> : '–'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingContractor(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Firma bearbeiten</DialogTitle>
            <DialogDescription>Aktualisieren Sie die Kontaktdaten.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formFields}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingContractor(null); resetForm(); }}>Abbrechen</Button>
              <Button onClick={handleUpdate}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Firma löschen?</AlertDialogTitle>
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

export default Contractors;
