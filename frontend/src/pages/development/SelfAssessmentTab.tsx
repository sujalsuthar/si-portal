import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, StatCard, Modal, Badge } from '@/components/ui';

export default function SelfAssessmentTab({ hideCompareCards = false }: { hideCompareCards?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'STUDENT';
  const isStaff = user && ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const ownStudentId = user?.profile?.id;
  const [selectedStudentId, setSelectedStudentId] = useState(ownStudentId ?? '');
  const [studentSearch, setStudentSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ topicOrSkill: '', platform: '', link: '' });
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});

  const studentId = isStudent ? ownStudentId : selectedStudentId;

  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', 'self-assess', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, pageSize: 10 } })).data,
    enabled: !!isStaff && studentSearch.length > 1,
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['self-assessments', studentId],
    queryFn: async () => (await api.get(`/self-assessments/student/${studentId}`)).data,
    enabled: !!studentId,
  });
  const { data: compare } = useQuery({
    queryKey: ['self-assessments', studentId, 'compare'],
    queryFn: async () => (await api.get(`/self-assessments/student/${studentId}/compare`)).data,
    enabled: !!studentId,
    retry: false,
  });

  async function submit() {
    if (!form.topicOrSkill.trim() || !form.link.trim()) return toast.error('Enter a topic and link');
    try {
      await api.post('/self-assessments', form);
      toast.success('Approval request submitted');
      setCreateOpen(false);
      setForm({ topicOrSkill: '', platform: '', link: '' });
      queryClient.invalidateQueries({ queryKey: ['self-assessments'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function decide(id: string, approvalStatus: 'APPROVED' | 'REJECTED') {
    try {
      await api.patch(`/self-assessments/${id}/decision`, { approvalStatus });
      toast.success(approvalStatus === 'APPROVED' ? 'Self-assessment approved' : 'Self-assessment rejected');
      setEditingIds((e) => ({ ...e, [id]: false }));
      queryClient.invalidateQueries({ queryKey: ['self-assessments'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  if (isStaff && !studentId) {
    return (
      <div>
        <label className="mb-3 block max-w-md">
          <span className="label">Select a student to review self-assessments</span>
          <input className="input" placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
        </label>
        {studentResults?.items?.length > 0 && (
          <div className="max-h-48 max-w-md overflow-y-auto rounded-lg border border-edge">
            {studentResults.items.map((s: any) => (
              <button
                key={s.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                onClick={() => {
                  setSelectedStudentId(s.id);
                  setStudentSearch(`${s.firstName} ${s.lastName}`);
                }}
              >
                {s.firstName} {s.lastName} ({s.studentCode})
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-ink-muted">Self-assessments are recorded per student. Search and select a student to approve or reject requests.</p>
      </div>
    );
  }

  if (!studentId) return <p className="text-sm text-ink-muted">Self-assessments are recorded per student.</p>;

  return (
    <div>
      {isStaff && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block max-w-md flex-1">
            <span className="label">Student</span>
            <input className="input" placeholder="Search to switch student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
          </label>
          {studentResults?.items?.length > 0 && (
            <div className="max-h-32 w-full max-w-md overflow-y-auto rounded-lg border border-edge">
              {studentResults.items.map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${selectedStudentId === s.id ? 'bg-brand-50' : ''}`}
                  onClick={() => {
                    setSelectedStudentId(s.id);
                    setStudentSearch(`${s.firstName} ${s.lastName}`);
                  }}
                >
                  {s.firstName} {s.lastName} ({s.studentCode})
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {compare && !hideCompareCards && (
        <div className="mb-5 form-grid-3">
          <StatCard label="Self-Confidence" value={`${compare.averageSelfConfidencePct}%`} />
          <StatCard label="Actual Performance" value={compare.averageActualPerformancePct != null ? `${compare.averageActualPerformancePct}%` : '-'} />
          <StatCard label="Gap" value={compare.gap != null ? `${compare.gap > 0 ? '+' : ''}${compare.gap}%` : '-'} tone={compare.gap > 15 ? 'warn' : 'default'} />
        </div>
      )}
      {isStudent && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ New Self-Assessment</button>
        </div>
      )}
      <Table
        loading={isLoading}
        rows={items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Topic', cell: (r: any) => r.topicOrSkill ?? '-' },
          { header: 'Platform', cell: (r: any) => r.platform ?? '-' },
          { header: 'Link', cell: (r: any) => r.link ? <a className="text-brand-ink hover:underline" href={r.link} target="_blank" rel="noreferrer">Open</a> : '-' },
          {
            header: 'Status',
            cell: (r: any) => <Badge tone={r.approvalStatus === 'APPROVED' ? 'green' : r.approvalStatus === 'REJECTED' ? 'red' : 'amber'}>{r.approvalStatus}</Badge>,
          },
          ...(isStaff
            ? [
                {
                  header: '',
                  cell: (r: any) =>
                    r.approvalStatus === 'PENDING' || editingIds[r.id] ? (
                      <div className="flex gap-2 text-xs">
                        <button className="text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => decide(r.id, 'APPROVED')}>Approve</button>
                        <button className="text-red-600 dark:text-red-400 hover:underline" onClick={() => decide(r.id, 'REJECTED')}>Reject</button>
                      </div>
                    ) : (
                      <button className="text-xs text-brand-ink hover:underline" onClick={() => setEditingIds((e) => ({ ...e, [r.id]: true }))}>Edit</button>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Self-Assessment">
        <div className="space-y-3">
          <label className="block"><span className="label">Topic</span><input className="input" value={form.topicOrSkill} onChange={(e) => setForm((f) => ({ ...f, topicOrSkill: e.target.value }))} /></label>
          <label className="block"><span className="label">Platform (optional)</span><input className="input" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} /></label>
          <label className="block"><span className="label">Link</span><input className="input" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={submit}>Approval Request</button></div>
        </div>
      </Modal>
    </div>
  );
}
