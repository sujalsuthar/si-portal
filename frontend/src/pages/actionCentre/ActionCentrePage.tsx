import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Badge, Modal } from '@/components/ui';

// Data Access Request and Data Erasure Request were removed from both Student and Parent Raise
// Request dropdowns per the 4.0 issue log; Behaviour Challenge was removed from Student's only.
const STUDENT_TYPES = ['BATCH_TRANSFER', 'PASSWORD_RESET', 'ACADEMIC_QUERY', 'RESULT_QUERY', 'GENERAL', 'DATA_CORRECTION_REQUEST'];
const PARENT_TYPES = ['FEE_QUERY', 'ATTENDANCE_QUERY', 'GENERAL', 'DATA_CORRECTION_REQUEST'];
const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate'> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', RESOLVED: 'slate' };

export default function ActionCentrePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const canRaise = user && ['STUDENT', 'PARENT'].includes(user.role);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [form, setForm] = useState({ type: (user?.role === 'PARENT' ? PARENT_TYPES[0] : STUDENT_TYPES[0]), subject: '', description: '' });

  const { data: requests, isLoading } = useQuery({ queryKey: ['action-centre'], queryFn: async () => (await api.get('/action-centre')).data });

  async function raise() {
    if (!form.subject || !form.description) return toast.error('Fill in subject and description');
    try {
      await api.post('/action-centre', form);
      toast.success('Request submitted');
      setRaiseOpen(false);
      setForm({ ...form, subject: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['action-centre'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function downloadExport(requestId: string) {
    try {
      const res = await api.get(`/action-centre/${requestId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `data-export-${requestId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function decide() {
    if (!decisionTarget || !remarks) return toast.error('Enter remarks');
    try {
      await api.patch(`/action-centre/${decisionTarget.id}/${decisionTarget.action}`, { remarks });
      toast.success(`Request ${decisionTarget.action}d`);
      setDecisionTarget(null);
      setRemarks('');
      queryClient.invalidateQueries({ queryKey: ['action-centre'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const typeOptions = user?.role === 'PARENT' ? PARENT_TYPES : STUDENT_TYPES;

  return (
    <div>
      <PageHeader
        title="Action Centre"
        subtitle={isStaff ? 'Requests raised by students and parents, awaiting a decision.' : 'Raise and track your requests.'}
        actions={canRaise && <button className="btn-primary" onClick={() => setRaiseOpen(true)}>+ Raise Request</button>}
      />
      <Table
        loading={isLoading}
        rows={requests ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Type', cell: (r: any) => r.type.replace(/_/g, ' ') },
          { header: 'Subject', cell: (r: any) => r.subject },
          ...(isStaff ? [{ header: 'Requester', cell: (r: any) => r.requester.email }] : []),
          {
            header: 'Status',
            cell: (r: any) => (
              <span className="inline-flex items-center gap-1.5">
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                {r.slaBreached && (
                  <span title={`Open ${r.hoursOpen}h, target ${r.slaTargetHours}h`}>
                    <Badge tone="red">SLA breached</Badge>
                  </span>
                )}
              </span>
            ),
          },
          { header: 'Raised', cell: (r: any) => new Date(r.createdAt).toLocaleDateString() },
          {
            header: 'Actions',
            cell: (r: any) => (
              <div className="flex items-center gap-2">
                {isStaff && r.status === 'PENDING' && (
                  <>
                    <button className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => setDecisionTarget({ id: r.id, action: 'approve' })}>Approve</button>
                    <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => setDecisionTarget({ id: r.id, action: 'reject' })}>Reject</button>
                  </>
                )}
                {r.type === 'DATA_ACCESS_REQUEST' && r.status === 'APPROVED' && (
                  <button className="text-xs text-brand-ink hover:underline" onClick={() => downloadExport(r.id)}>Download Export</button>
                )}
                {isStaff && r.status !== 'PENDING' && r.type !== 'DATA_ACCESS_REQUEST' && (r.remarks ?? '-')}
              </div>
            ),
          },
        ]}
      />

      <Modal open={raiseOpen} onClose={() => setRaiseOpen(false)} title="Raise Request">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {typeOptions.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Subject</span><input className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></label>
          <label className="block"><span className="label">Description</span><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={raise}>Submit</button></div>
        </div>
      </Modal>

      <Modal open={!!decisionTarget} onClose={() => setDecisionTarget(null)} title={decisionTarget?.action === 'approve' ? 'Approve Request' : 'Reject Request'}>
        <div className="space-y-3">
          <label className="block"><span className="label">Remarks</span><textarea className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={decide}>Confirm</button></div>
        </div>
      </Modal>
    </div>
  );
}
