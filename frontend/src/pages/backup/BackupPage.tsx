import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Badge, Modal } from '@/components/ui';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canManage = !!user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [confirmText, setConfirmText] = useState('');

  const { data: records, isLoading } = useQuery({ queryKey: ['backup'], queryFn: async () => (await api.get('/backup')).data });
  const { data: nextScheduled } = useQuery<{ enabled: boolean; nextRun: string | null }>({ queryKey: ['backup', 'next-scheduled'], queryFn: async () => (await api.get('/backup/next-scheduled')).data, enabled: !!canManage });

  async function runBackup() {
    try {
      toast.loading('Running database backup…', { id: 'backup' });
      await api.post('/backup/run');
      toast.success('Backup completed', { id: 'backup' });
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Backup failed'), { id: 'backup' });
    }
  }

  async function download(id: string, filename: string) {
    const res = await api.get(`/backup/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.enc$/, '');
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore() {
    if (confirmText !== 'RESTORE') return toast.error('Type RESTORE to confirm');
    try {
      toast.loading('Restoring database…', { id: 'restore' });
      await api.post(`/backup/${restoreTarget.id}/restore`, { confirm: 'RESTORE' });
      toast.success('Database restored', { id: 'restore' });
      setRestoreTarget(null);
      setConfirmText('');
      queryClient.invalidateQueries({ queryKey: ['backup'] });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Restore failed'), { id: 'restore' });
    }
  }

  return (
    <div>
      <PageHeader
        title="Backup"
        subtitle="Encrypted database snapshots, an automatic nightly schedule, and batch archive exports."
        actions={canManage && <button className="btn-primary" onClick={runBackup}>Run Backup Now</button>}
      />
      {canManage && nextScheduled && (
        <p className="mb-3 text-xs text-ink-muted">
          {nextScheduled.enabled && nextScheduled.nextRun
            ? <>Next automatic backup: <span className="font-medium text-ink">{new Date(nextScheduled.nextRun).toLocaleString()}</span></>
            : 'Automatic scheduled backup is disabled.'}
        </p>
      )}
      <Table
        loading={isLoading}
        rows={records ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'File', cell: (r: any) => r.filename },
          { header: 'Type', cell: (r: any) => <Badge tone={r.type === 'BATCH_ARCHIVE' ? 'blue' : r.type === 'SCHEDULED' ? 'green' : 'slate'}>{r.type.replace('_', ' ')}</Badge> },
          { header: 'Size', cell: (r: any) => formatBytes(r.sizeBytes) },
          { header: 'Encrypted', cell: (r: any) => (r.encrypted ? <Badge tone="green">Yes</Badge> : <Badge tone="slate">No</Badge>) },
          { header: 'Offsite', cell: (r: any) => (r.offsitePath ? <Badge tone="green">Copied</Badge> : '-') },
          { header: 'Created', cell: (r: any) => new Date(r.createdAt).toLocaleString() },
          ...(canManage
            ? [
                {
                  header: 'Actions',
                  cell: (r: any) => (
                    <div className="flex gap-2">
                      <button className="text-xs text-brand-ink hover:underline" onClick={() => download(r.id, r.filename)}>Download</button>
                      {isSuperAdmin && <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => setRestoreTarget(r)}>Restore</button>}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {!canManage && <p className="mt-3 text-xs text-ink-muted">Downloading or restoring a backup is restricted to Super Admin and Academic Admin. Every action is logged.</p>}
      {canManage && !isSuperAdmin && <p className="mt-3 text-xs text-ink-muted">Restoring a backup is restricted to Super Admin. Every action is logged.</p>}
      <p className="mt-3 text-xs text-ink-muted">A batch past its retention age gets a one-time "final backup" option on its detail page before archival.</p>

      <Modal open={!!restoreTarget} onClose={() => { setRestoreTarget(null); setConfirmText(''); }} title="Restore Database">
        <div className="space-y-3">
          <p className="text-sm text-red-600">This overwrites the current database with the contents of <span className="font-mono">{restoreTarget?.filename}</span>. This cannot be undone.</p>
          <label className="block"><span className="label">Type RESTORE to confirm</span><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></label>
          <div className="flex justify-end"><button className="btn-danger" onClick={restore}>Restore Database</button></div>
        </div>
      </Modal>
    </div>
  );
}
