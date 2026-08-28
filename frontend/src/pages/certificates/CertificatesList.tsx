import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Badge, Modal } from '@/components/ui';

export default function CertificatesList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canIssue = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const canRevoke = user && user.role === 'SUPER_ADMIN';
  const [issueOpen, setIssueOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<any>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [form, setForm] = useState({ studentId: '', title: '', completionDate: '' });
  const [bulkForm, setBulkForm] = useState({ batchId: '', title: '', completionDate: '' });
  const [bulkResults, setBulkResults] = useState<any[] | null>(null);

  const { data: items, isLoading } = useQuery({ queryKey: ['certificates'], queryFn: async () => (await api.get('/certificates')).data });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, pageSize: 10 } })).data,
    enabled: issueOpen && studentSearch.length > 1,
  });
  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data, enabled: bulkOpen });
  const { data: eligibility } = useQuery({
    queryKey: ['certificates', 'bulk-eligibility', bulkForm.batchId],
    queryFn: async () => (await api.get('/certificates/bulk/eligibility', { params: { batchId: bulkForm.batchId } })).data,
    enabled: bulkOpen && !!bulkForm.batchId,
  });

  async function issue() {
    if (!form.studentId || !form.title || !form.completionDate) return toast.error('Fill in all fields');
    try {
      await api.post('/certificates', form);
      toast.success('Certificate issued');
      setIssueOpen(false);
      setForm({ studentId: '', title: '', completionDate: '' });
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function revoke() {
    if (!revokeReason.trim()) return toast.error('Enter a revocation reason');
    try {
      await api.patch(`/certificates/${revokeTarget.id}/revoke`, { reason: revokeReason });
      toast.success('Certificate revoked');
      setRevokeTarget(null);
      setRevokeReason('');
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function downloadFile(id: string, kind: 'pdf' | 'image', certificateNumber: string) {
    try {
      const res = await api.get(`/certificates/${id}/${kind === 'pdf' ? 'pdf' : 'image'}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${certificateNumber}.${kind === 'pdf' ? 'pdf' : 'svg'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function bulkIssue() {
    if (!bulkForm.batchId || !bulkForm.title || !bulkForm.completionDate) return toast.error('Fill in all fields');
    try {
      const res = await api.post('/certificates/bulk', bulkForm);
      setBulkResults(res.data);
      toast.success('Bulk issue complete');
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Certificates"
        subtitle="Generate, manage and verify final completion certificates."
        actions={
          canIssue && (
            <>
              <button className="btn-secondary" onClick={() => { setBulkResults(null); setBulkOpen(true); }}>Bulk Issue</button>
              <button className="btn-primary" onClick={() => setIssueOpen(true)}>+ Issue Certificate</button>
            </>
          )
        }
      />
      <Table
        loading={isLoading}
        rows={items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Certificate No.', cell: (r: any) => <span className="font-mono text-xs">{r.certificateNumber}</span> },
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          {
            header: 'Course',
            cell: (r: any) => (
              <span className="inline-flex items-center gap-1.5">
                {r.title}
                {r.status !== 'VALID' && <Badge tone={r.status === 'REVOKED' ? 'red' : 'amber'}>{r.status}</Badge>}
              </span>
            ),
          },
          { header: 'Batch', cell: (r: any) => r.batch?.name ?? '-' },
          { header: 'Issue Date', cell: (r: any) => new Date(r.issueDate).toDateString() },
          {
            header: 'Actions',
            cell: (r: any) => (
              <details className="relative">
                <summary className="cursor-pointer list-none text-xs text-brand-ink hover:underline">Actions ▾</summary>
                <div className="card absolute right-0 z-10 mt-1 w-32 py-1 shadow-lg">
                  <button className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-muted" onClick={() => downloadFile(r.id, 'pdf', r.certificateNumber)}>Download PDF</button>
                  <button className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-muted" onClick={() => downloadFile(r.id, 'image', r.certificateNumber)}>Download Image</button>
                  <Link className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-muted" to={`/verify/${r.certificateNumber}`} target="_blank">Verify</Link>
                  {canRevoke && r.status === 'VALID' && (
                    <button className="block w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-surface-muted" onClick={() => setRevokeTarget(r)}>Revoke</button>
                  )}
                </div>
              </details>
            ),
          },
        ]}
      />

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue Certificate">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Student</span>
            <input className="input" placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            {studentResults?.items?.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-edge">
                {studentResults.items.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                    onClick={() => { setForm((f) => ({ ...f, studentId: s.id })); setStudentSearch(`${s.firstName} ${s.lastName}`); }}
                  >
                    {s.firstName} {s.lastName}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block"><span className="label">Title</span><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Full Stack Web Development - Completion" /></label>
          <label className="block"><span className="label">Completion Date</span><input className="input" type="date" value={form.completionDate} onChange={(e) => setForm((f) => ({ ...f, completionDate: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={issue}>Issue Certificate</button></div>
        </div>
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Issue Certificates" wide>
        <div className="space-y-3">
          <label className="block">
            <span className="label">Batch</span>
            <select className="input" value={bulkForm.batchId} onChange={(e) => { setBulkForm((f) => ({ ...f, batchId: e.target.value })); setBulkResults(null); }}>
              <option value="">Select…</option>
              {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Title</span><input className="input" value={bulkForm.title} onChange={(e) => setBulkForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Full Stack Web Development - Completion" /></label>
          <label className="block"><span className="label">Completion Date</span><input className="input" type="date" value={bulkForm.completionDate} onChange={(e) => setBulkForm((f) => ({ ...f, completionDate: e.target.value }))} /></label>

          {bulkForm.batchId && !bulkResults && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Eligibility preview</p>
              <div className="max-h-48 divide-y divide-edge overflow-y-auto rounded-lg border border-edge">
                {(eligibility ?? []).map((e: any) => (
                  <div key={e.studentId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span>{e.name} ({e.studentCode})</span>
                    {e.eligible ? <Badge tone="green">Eligible</Badge> : <span className="text-red-600 dark:text-red-400">{e.reasons.join('; ')}</span>}
                  </div>
                ))}
                {eligibility?.length === 0 && <p className="px-3 py-3 text-center text-ink-muted">No active students in this batch</p>}
              </div>
            </div>
          )}

          {bulkResults && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Results</p>
              <div className="max-h-48 divide-y divide-edge overflow-y-auto rounded-lg border border-edge">
                {bulkResults.map((r: any) => (
                  <div key={r.studentId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span>{r.name}</span>
                    {r.issued ? <Badge tone="green">{r.certificateNumber}</Badge> : <span className="text-red-600 dark:text-red-400">{(r.reasons ?? []).join('; ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>Close</button>
            {!bulkResults && <button className="btn-primary" onClick={bulkIssue}>Issue to Eligible Students</button>}
          </div>
        </div>
      </Modal>

      <Modal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="Revoke Certificate">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Revoking <span className="font-mono">{revokeTarget?.certificateNumber}</span> is recorded in the audit trail and shown on public verification.</p>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={2} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} /></label>
          <div className="flex justify-end"><button className="btn-danger" onClick={revoke}>Revoke</button></div>
        </div>
      </Modal>
    </div>
  );
}
