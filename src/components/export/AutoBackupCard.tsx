import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/utils';
import { DatabaseBackup, Download, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface BackupMeta {
  id: string;
  created_at: string;
  size_bytes: number;
  note: string | null;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Automatische Daten-Snapshots (Plan 7.2): wöchentlich per pg_cron in die
 * backups-Tabelle, manuell über "Jetzt sichern". Dateien (PDFs etc.) sind
 * nicht enthalten — dafür gibt es das vollständige ZIP-Backup oben.
 */
export const AutoBackupCard: React.FC = () => {
  const { toast } = useToast();
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('backups')
      .select('id, created_at, size_bytes, note')
      .order('created_at', { ascending: false });
    if (error) {
      // Tabelle existiert noch nicht (Migration ausstehend) — Karte stumm schalten
      setAvailable(false);
      return;
    }
    setAvailable(true);
    setBackups((data as BackupMeta[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('create_household_backup');
    if (error) {
      toast({ title: 'Fehler', description: errorMessage(new Error(error.message), 'Backup fehlgeschlagen'), variant: 'destructive' });
    } else {
      toast({ title: 'Erfolg', description: 'Sicherung wurde erstellt' });
      await load();
    }
    setBusy(false);
  };

  const handleDownload = async (backup: BackupMeta) => {
    const { data, error } = await supabase
      .from('backups')
      .select('payload')
      .eq('id', backup.id)
      .single();
    if (error || !data) {
      toast({ title: 'Fehler', description: 'Sicherung konnte nicht geladen werden', variant: 'destructive' });
      return;
    }
    const blob = new Blob([JSON.stringify(data.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baukosten-backup_${format(new Date(backup.created_at), 'yyyy-MM-dd_HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('backups').delete().eq('id', id);
    if (!error) await load();
  };

  if (!available) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" /> Automatische Sicherungen
        </CardTitle>
        <CardDescription>
          Alle Daten (ohne Dateien) werden jeden Montag automatisch gesichert; die letzten 8 Stände bleiben erhalten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Sicherungen — die erste läuft automatisch am Montag, oder Sie sichern jetzt manuell.
          </p>
        ) : (
          <div className="space-y-1">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <span className="flex-1">
                  {format(new Date(b.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  <span className="ml-2 text-xs text-muted-foreground">{formatSize(b.size_bytes)}</span>
                </span>
                <Button size="icon" variant="ghost" title="Als JSON herunterladen" onClick={() => handleDownload(b)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Löschen" onClick={() => handleDelete(b.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button onClick={handleCreate} disabled={busy} variant="outline">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseBackup className="mr-2 h-4 w-4" />}
          Jetzt sichern
        </Button>
      </CardContent>
    </Card>
  );
};
