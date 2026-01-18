import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Users, Mail, Trash2, UserPlus, Home, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface HouseholdInvitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export default function Settings() {
  const { household, householdProfiles, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [householdName, setHouseholdName] = useState(household?.name || '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch pending invitations
  const { data: invitations = [], isLoading: loadingInvitations } = useQuery({
    queryKey: ['household-invitations', household?.id],
    queryFn: async () => {
      if (!household?.id) return [];
      const { data, error } = await supabase
        .from('household_invitations')
        .select('*')
        .eq('household_id', household.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as HouseholdInvitation[];
    },
    enabled: !!household?.id,
  });

  // Update household name
  const handleUpdateHouseholdName = async () => {
    if (!household?.id || !householdName.trim()) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('households')
      .update({ name: householdName.trim() })
      .eq('id', household.id);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Haushaltsname konnte nicht geändert werden.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Gespeichert',
        description: 'Haushaltsname wurde aktualisiert.',
      });
      await refreshProfile();
    }
    setSaving(false);
  };

  // Send invitation
  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!household?.id || !profile?.id) throw new Error('Nicht angemeldet');
      
      const { error } = await supabase
        .from('household_invitations')
        .insert({
          household_id: household.id,
          email: email.toLowerCase().trim(),
          invited_by_profile_id: profile.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Einladung gesendet',
        description: `Eine Einladung wurde an ${inviteEmail} gesendet.`,
      });
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['household-invitations'] });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: 'Einladung konnte nicht gesendet werden.',
        variant: 'destructive',
      });
    },
  });

  // Cancel invitation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('household_invitations')
        .delete()
        .eq('id', invitationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Einladung zurückgezogen',
        description: 'Die Einladung wurde gelöscht.',
      });
      queryClient.invalidateQueries({ queryKey: ['household-invitations'] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate(inviteEmail);
  };

  if (!household) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalte deinen Haushalt und lade Mitglieder ein.
          </p>
        </div>

        {/* Household Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Haushalt
            </CardTitle>
            <CardDescription>
              Ändere den Namen deines Haushalts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="household-name" className="sr-only">
                  Haushaltsname
                </Label>
                <Input
                  id="household-name"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Name des Haushalts"
                />
              </div>
              <Button 
                onClick={handleUpdateHouseholdName} 
                disabled={saving || householdName === household.name}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Speichern'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Mitglieder ({householdProfiles.length})
            </CardTitle>
            <CardDescription>
              Aktuelle Mitglieder deines Haushalts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {householdProfiles.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      {member.iban && (
                        <p className="text-sm text-muted-foreground">
                          IBAN hinterlegt
                        </p>
                      )}
                    </div>
                  </div>
                  {member.id === profile?.id && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      Du
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Invite Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Mitglied einladen
            </CardTitle>
            <CardDescription>
              Lade eine Person per E-Mail zu deinem Haushalt ein.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleInvite} className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="invite-email" className="sr-only">
                  E-Mail-Adresse
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@beispiel.de"
                  required
                />
              </div>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Einladen
                  </>
                )}
              </Button>
            </form>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-3">Offene Einladungen</p>
                  <div className="space-y-2">
                    {invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between rounded-lg border p-3 bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{invitation.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Eingeladen am {new Date(invitation.created_at).toLocaleDateString('de-DE')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                          disabled={cancelInvitationMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
