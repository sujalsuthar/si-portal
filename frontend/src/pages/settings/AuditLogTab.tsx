import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge } from '@/components/ui';

export default function AuditLogTab() {
  const { user } = useAuth();
  const [entityType, setEntityType] = useState('');
  const [integrity, setIntegrity] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', entityType],
    queryFn: async () => (await api.get('/audit-logs', { params: { entityType: entityType || undefined, pageSize: 50 } })).data,
  });

  async function runIntegrityCheck() {
    setChecking(true);
    try {
      const res = await api.get('/audit-logs/integrity-check');
      setIntegrity(res.data);
      toast[res.data.intact ? 'success' : 'error'](res.data.intact ? 'Hash chain intact' : `${res.data.breaks.length} break(s) detected`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <select className="input w-56 max-lg:w-full" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entities</option>
          {['Grade', 'Attendance', 'BatchTransfer', 'BehaviourEvent', 'Certificate', 'User', 'Student', 'Task', 'TaskSubmission', 'Exam', 'FeedPost', 'BackupRecord'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {user?.role === 'SUPER_ADMIN' && (
          <button className="btn-secondary text-xs" onClick={runIntegrityCheck} disabled={checking}>
            {checking ? 'Checking…' : 'Run Integrity Check'}
          </button>
        )}
      </div>
      {integrity && (
        <div className="mb-3 rounded-lg border border-edge p-3 text-xs">
          <Badge tone={integrity.intact ? 'green' : 'red'}>{integrity.intact ? 'Chain Intact' : 'Chain Broken'}</Badge>
          <span className="ml-2 text-ink-muted">{integrity.chainedEntriesChecked} entries verified of {integrity.totalEntries} total.</span>
          {!integrity.intact && <p className="mt-1 text-red-600 dark:text-red-400">Breaks at: {integrity.breaks.map((b: any) => b.id.slice(0, 8)).join(', ')}</p>}
        </div>
      )}
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'When', cell: (r: any) => new Date(r.createdAt).toLocaleString() },
          { header: 'Entity', cell: (r: any) => `${r.entityType} (${r.entityId.slice(0, 8)}…)` },
          { header: 'Action', cell: (r: any) => r.action },
          { header: 'Actor', cell: (r: any) => r.actor?.email ?? 'System' },
          { header: 'Reason', cell: (r: any) => r.reason ?? '-' },
          {
            header: '',
            cell: (r: any) =>
              r.oldValue || r.newValue ? (
                <button className="text-xs text-brand-ink hover:underline" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  {expandedId === r.id ? 'Hide' : 'Details'}
                </button>
              ) : null,
          },
        ]}
      />
      {expandedId && (() => {
        const row = (data?.items ?? []).find((r: any) => r.id === expandedId);
        if (!row) return null;
        return (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {row.oldValue && (
              <div className="rounded-lg border border-edge p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Before</p>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-ink-muted">{JSON.stringify(row.oldValue, null, 2)}</pre>
              </div>
            )}
            {row.newValue && (
              <div className="rounded-lg border border-edge p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">After</p>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-ink-muted">{JSON.stringify(row.newValue, null, 2)}</pre>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
