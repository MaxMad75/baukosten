import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2 } from 'lucide-react';

interface AddMemberFormProps {
  onMemberAdded: () => void;
}

export function AddMemberForm({ onMemberAdded }: AddMemberFormProps) {
  const { household } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [iban, setIban] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!household?.id || !name.trim()) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .insert({
        name: name.trim(),
        iban: iban.trim() || null,
        household_id: household.id,
        user_id: null as any, // placeholder profile without login
      });

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Mitglied konnte nicht angelegt werden.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Mitglied angelegt',
        description: `${name.trim()} wurde zum Haushalt hinzugefügt.`,
      });
      setName('');
      setIban('');
      onMemberAdded();
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Mitglied manuell anlegen
        </CardTitle>
        <CardDescription>
          Lege ein Platzhalter-Profil an, um Rechnungen zuzuweisen — auch ohne Account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-name">Name *</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Max Mustermann"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-iban">IBAN (optional)</Label>
              <Input
                id="member-iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="DE89 3704 0044 ..."
              />
            </div>
          </div>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Anlegen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
