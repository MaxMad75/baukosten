import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useOffers } from '@/hooks/useOffers';
import { useContractors } from '@/hooks/useContractors';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { KostengruppenSelect } from '@/components/KostengruppenSelect';
import { Offer, OfferItem } from '@/lib/types';
import {
  Plus, Loader2, Trash2, Edit, Search, FileText, Package, Save, X
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
import { Badge } from '@/components/ui/badge';

const emptyForm = {
  company_name: '',
  title: '',
  offer_date: '',
  contractor_id: '',
  is_gross: true,
  notes: '',
};

interface OfferItemRow {
  id?: string;
  kostengruppe_code: string;
  amount: number;
  description: string;
  is_gross: boolean;
}

const formatCurrency = (amount: number, isPrivate: boolean) => {
  if (isPrivate) return '•••••';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const Offers: React.FC = () => {
  const { offers, loading, createOffer, updateOffer, deleteOffer, fetchOfferItems, saveOfferItems } = useOffers();
  const { contractors } = useContractors();
  const { isPrivate } = usePrivacy();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(emptyForm);

  // Item editor state
  const [editingItemsOfferId, setEditingItemsOfferId] = useState<string | null>(null);
  const [itemRows, setItemRows] = useState<OfferItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const resetForm = () => setFormData(emptyForm);

  // Auto-open edit dialog when navigated with ?edit=<offerId>
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && offers.length > 0) {
      const match = offers.find(o => o.id === editId);
      if (match) {
        openEdit(match);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, offers]);

  const handleCreate = async () => {
    if (!formData.company_name || !formData.title) return;
    const result = await createOffer({
      company_name: formData.company_name,
      title: formData.title,
      offer_date: formData.offer_date || undefined,
      contractor_id: formData.contractor_id || undefined,
      is_gross: formData.is_gross,
      notes: formData.notes || undefined,
    });
    if (result) { resetForm(); setIsCreateOpen(false); }
  };

  const openEdit = (o: Offer) => {
    setEditingOffer(o);
    setFormData({
      company_name: o.company_name,
      title: o.title,
      offer_date: o.offer_date || '',
      contractor_id: o.contractor_id || '',
      is_gross: o.is_gross,
      notes: o.notes || '',
    });
  };

  const handleUpdate = async () => {
    if (!editingOffer || !formData.company_name || !formData.title) return;
    const success = await updateOffer(editingOffer.id, {
      company_name: formData.company_name,
      title: formData.title,
      offer_date: formData.offer_date || null,
      contractor_id: formData.contractor_id || null,
      is_gross: formData.is_gross,
      notes: formData.notes || null,
    });
    if (success) { setEditingOffer(null); resetForm(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteOffer(deleteId);
    setDeleteId(null);
  };

  const openItemEditor = async (offerId: string) => {
    setItemsLoading(true);
    setEditingItemsOfferId(offerId);
    const items = await fetchOfferItems(offerId);
    setItemRows(items.map(i => ({
      id: i.id,
      kostengruppe_code: i.kostengruppe_code,
      amount: i.amount,
      description: i.description || '',
      is_gross: i.is_gross,
    })));
    setItemsLoading(false);
  };

  const addItemRow = () => {
    setItemRows(prev => [...prev, { kostengruppe_code: '', amount: 0, description: '', is_gross: true }]);
  };

  const removeItemRow = (index: number) => {
    setItemRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateItemRow = (index: number, field: keyof OfferItemRow, value: any) => {
    setItemRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const handleSaveItems = async () => {
    if (!editingItemsOfferId) return;
    const validItems = itemRows.filter(r => r.kostengruppe_code && r.amount > 0);
    const success = await saveOfferItems(editingItemsOfferId, validItems);
    if (success) {
      setEditingItemsOfferId(null);
      setItemRows([]);
    }
  };

  const filtered = offers.filter((o) =>
    o.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formFields = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Firmenname *</Label>
        <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="z.B. Elektro Müller GmbH" />
      </div>
      <div className="space-y-2">
        <Label>Titel *</Label>
        <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="z.B. Elektroinstallation EG" />
      </div>
      <div className="space-y-2">
        <Label>Angebotsdatum</Label>
        <Input type="date" value={formData.offer_date} onChange={(e) => setFormData({ ...formData, offer_date: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Firma (Verknüpfung)</Label>
        <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
          <SelectTrigger><SelectValue placeholder="Firma wählen (optional)" /></SelectTrigger>
          <SelectContent>
            {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-2">
        <Label>Notizen</Label>
        <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Zusätzliche Informationen..." />
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
            <h1 className="text-3xl font-bold">Angebote</h1>
            <p className="text-muted-foreground">Verwalten Sie Ihre Angebote und ordnen Sie sie Kostengruppen zu</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Neues Angebot</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Neues Angebot erstellen</DialogTitle>
                <DialogDescription>Erfassen Sie die Daten des Angebots.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {formFields}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { resetForm(); setIsCreateOpen(false); }}>Abbrechen</Button>
                  <Button onClick={handleCreate}>Angebot erstellen</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" placeholder="Suche nach Firma oder Titel..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Keine Angebote vorhanden</p>
              <p className="text-muted-foreground">Erstellen Sie Ihr erstes Angebot.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Firma</TableHead>
                    <TableHead>Titel</TableHead>
                    <TableHead className="hidden md:table-cell">Datum</TableHead>
                    <TableHead className="text-right">Summe</TableHead>
                    <TableHead className="w-32">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="font-medium">{o.company_name}</div>
                        {o.contractor_id && (
                          <Badge variant="outline" className="text-xs mt-1">verknüpft</Badge>
                        )}
                      </TableCell>
                      <TableCell>{o.title}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {o.offer_date ? new Date(o.offer_date).toLocaleDateString('de-DE') : '–'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(o.total_amount, isPrivate)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openItemEditor(o.id)} title="Positionen bearbeiten">
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(o)} title="Bearbeiten">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)} title="Löschen">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
      <Dialog open={!!editingOffer} onOpenChange={(o) => { if (!o) { setEditingOffer(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Angebot bearbeiten</DialogTitle>
            <DialogDescription>Aktualisieren Sie die Angebotsdaten.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formFields}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditingOffer(null); resetForm(); }}>Abbrechen</Button>
              <Button onClick={handleUpdate}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Editor Dialog */}
      <Dialog open={!!editingItemsOfferId} onOpenChange={(o) => { if (!o) { setEditingItemsOfferId(null); setItemRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Angebotspositionen bearbeiten</DialogTitle>
            <DialogDescription>Ordnen Sie Kostengruppen und Beträge zu.</DialogDescription>
          </DialogHeader>
          {itemsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {itemRows.map((row, index) => (
                <div key={index} className="flex gap-2 items-start border rounded-lg p-3">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Kostengruppe</Label>
                    <KostengruppenSelect
                      value={row.kostengruppe_code || null}
                      onValueChange={(v) => updateItemRow(index, 'kostengruppe_code', v)}
                    />
                  </div>
                  <div className="w-36 space-y-2">
                    <Label className="text-xs">Betrag (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.amount || ''}
                      onChange={(e) => updateItemRow(index, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Beschreibung</Label>
                    <Input
                      value={row.description}
                      onChange={(e) => updateItemRow(index, 'description', e.target.value)}
                      placeholder="optional"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="mt-6" onClick={() => removeItemRow(index)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addItemRow} className="w-full">
                <Plus className="mr-2 h-4 w-4" />Position hinzufügen
              </Button>
              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  Summe: <span className="font-medium text-foreground">{formatCurrency(itemRows.reduce((s, r) => s + (r.amount || 0), 0), isPrivate)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setEditingItemsOfferId(null); setItemRows([]); }}>Abbrechen</Button>
                  <Button onClick={handleSaveItems}><Save className="mr-2 h-4 w-4" />Speichern</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Angebot löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Angebot und alle zugehörigen Positionen werden unwiderruflich gelöscht.</AlertDialogDescription>
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

export default Offers;
