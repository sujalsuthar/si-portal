import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { Table, Badge, Modal } from '@/components/ui';

const SEVERITY_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate'> = { LOW: 'slate', MEDIUM: 'amber', HIGH: 'red', CRITICAL: 'red' };

export default function InterventionsTab() {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<any>(null);
  const [noteText, setNoteText] = useState('');

  const { data: cases, isLoading } = useQuery({ queryKey: ['interventions'], queryFn: async () => (await api.get('/interventions')).data });
  const { data: caseDetail } = useQuery({
    queryKey: ['interventions', detail?.id],
    queryFn: async () => (await api.get(`/interventions/${detail.id}`)).data,
    enabled: !!detail,
  });

  async function runAutoDetect() {
    try {
      const res = await api.post('/interventions/auto-detect');
      toast.success(`${res.data.createdCount} new case(s) detected`);
      queryClient.invalidateQueries({ queryKey: ['interventions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/interventions/${id}`, { status });
      toast.success('Case updated');
      queryClient.invalidateQueries({ queryKey: ['interventions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    try {
      await api.post(`/interventions/${detail.id}/notes`, { note: noteText });
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['interventions', detail.id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <p className="mb-4 text-xs text-ink-muted">
        A private early-warning list for authorized staff. Trigger data such as low attendance, failing grades and overdue tasks is never shown publicly.
      </p>
      <div className="mb-3 flex justify-end">
        <button className="btn-secondary" onClick={runAutoDetect}>Run Auto-Detection</button>
      </div>
      <Table
        loading={isLoading}
        rows={cases ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Student', cell: (r: any) => <button className="text-brand-ink hover:underline font-medium" onClick={() => setDetail(r)}>{r.student.firstName} {r.student.lastName}</button> },
          { header: 'Trigger', cell: (r: any) => r.triggerType.replace(/_/g, ' ') },
          { header: 'Severity', cell: (r: any) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge> },
          { header: 'Assigned', cell: (r: any) => (r.assignedFaculty ? `${r.assignedFaculty.firstName} ${r.assignedFaculty.lastName}` : '-') },
          {
            header: 'Status',
            cell: (r: any) => (
              <select className="input py-1 text-xs" value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ),
          },
        ]}
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.student.firstName} ${detail.student.lastName}` : ''} wide>
        {caseDetail && (
          <div>
            <p className="mb-1 text-sm text-ink"><strong>Trigger:</strong> {caseDetail.triggerReason}</p>
            <p className="mb-4 text-sm text-ink-muted"><strong>Follow-up:</strong> {caseDetail.followUpDate ? new Date(caseDetail.followUpDate).toDateString() : 'Not set'}</p>
            <h3 className="mb-2 text-sm font-semibold text-ink">Notes</h3>
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
              {caseDetail.notes.map((n: any) => (
                <div key={n.id} className="rounded-lg bg-surface-muted px-3 py-2 text-sm">{n.note}</div>
              ))}
              {caseDetail.notes.length === 0 && <p className="text-sm text-ink-muted">No notes yet</p>}
            </div>
            <div className="flex gap-2">
              <input className="input" placeholder="Add a follow-up note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button className="btn-primary shrink-0" onClick={addNote}>Add</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
