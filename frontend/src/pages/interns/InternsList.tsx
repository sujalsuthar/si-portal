import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Badge, Modal, StatCard } from '@/components/ui';

const STATUS_TONE: Record<string, 'green' | 'red' | 'slate'> = { ACTIVE: 'green', DEMOTED: 'red', COMPLETED: 'slate' };

export default function InternsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isStaff = user && ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const canPromote = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);

  if (!isStaff && user?.role === 'STUDENT') return <StudentDevelopmentView studentId={user.profile?.id} />;

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [form, setForm] = useState({ studentId: '', mentorId: '' });

  const { data: interns, isLoading } = useQuery({ queryKey: ['interns'], queryFn: async () => (await api.get('/interns')).data });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, pageSize: 10 } })).data,
    enabled: promoteOpen && studentSearch.length > 1,
  });
  const { data: facultyList } = useQuery({ queryKey: ['faculty', 'all'], queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100 } })).data, enabled: promoteOpen });

  async function downloadReport() {
    try {
      const res = await api.get('/interns/report.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'intern-report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not export intern report'));
    }
  }

  async function promote() {
    if (!form.studentId || !form.mentorId) return toast.error('Select a student and a mentor');
    try {
      await api.post('/interns/promote', form);
      toast.success('Student promoted to Intern');
      setPromoteOpen(false);
      setForm({ studentId: '', mentorId: '' });
      queryClient.invalidateQueries({ queryKey: ['interns'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Interns"
        subtitle="Internship promotion, mentoring and progress."
        actions={
          <>
            {isStaff && <button className="btn-secondary" onClick={downloadReport}>Download Intern Report</button>}
            {canPromote && <button className="btn-primary" onClick={() => setPromoteOpen(true)}>+ Promote to Intern</button>}
          </>
        }
      />
      <Table
        loading={isLoading}
        rows={interns ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Name', cell: (r: any) => <button className="text-brand-ink hover:underline font-medium" onClick={() => navigate(`/interns/${r.id}`)}>{r.firstName} {r.lastName}</button> },
          { header: 'Batch', cell: (r: any) => r.currentBatch?.name ?? '-' },
          { header: 'Mentor', cell: (r: any) => (r.mentorFaculty ? `${r.mentorFaculty.firstName} ${r.mentorFaculty.lastName}` : '-') },
          { header: 'Status', cell: (r: any) => <Badge tone={STATUS_TONE[r.internStatus]}>{r.internStatus}</Badge> },
          { header: 'Work Status', cell: (r: any) => (r.internFrozen ? <Badge tone="red">Paused - Review Pending</Badge> : <Badge tone="green">Active</Badge>) },
        ]}
      />
      <Modal open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Promote to Intern">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Student</span>
            <input className="input" placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            {studentResults?.items?.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-edge">
                {studentResults.items.map((s: any) => (
                  <button key={s.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted" onClick={() => { setForm((f) => ({ ...f, studentId: s.id })); setStudentSearch(`${s.firstName} ${s.lastName}`); }}>
                    {s.firstName} {s.lastName}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block">
            <span className="label">Mentor</span>
            <select className="input" value={form.mentorId} onChange={(e) => setForm((f) => ({ ...f, mentorId: e.target.value }))}>
              <option value="">Select…</option>
              {facultyList?.items?.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
          </label>
          <div className="flex justify-end"><button className="btn-primary" onClick={promote}>Promote</button></div>
        </div>
      </Modal>
    </div>
  );
}

// Intern dashboard - mirrors the Student dashboard's stat-card layout, plus Ratings and Task
// information specific to the internship (4.0 issue log, Student module item 5).
function StudentDevelopmentView({ studentId }: { studentId?: string }) {
  const { data } = useQuery({
    queryKey: ['interns', studentId, 'development-view'],
    queryFn: async () => (await api.get(`/interns/${studentId}/development-view`)).data,
    enabled: !!studentId,
  });
  const { data: tasks, isLoading: loadingTasks } = useQuery({ queryKey: ['tasks', 'me'], queryFn: async () => (await api.get('/tasks', { params: { pageSize: 10 } })).data });

  if (!data?.band) {
    return (
      <div>
        <PageHeader title="Interns" subtitle="Your internship progress will appear here once you are promoted and rated." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="My Internship Dashboard" subtitle="Ratings and task information for your internship." />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Overall Band" value={data.band} tone={data.band === 'Below Expectations' ? 'bad' : data.band === 'Meeting Expectations' ? 'default' : 'good'} />
        <StatCard label="Work Status" value={data.frozen ? 'Paused - Review Pending' : 'Active'} tone={data.frozen ? 'bad' : 'good'} />
      </div>
      {data.mentorComment && (
        <div className="card mb-5 p-4">
          <h3 className="mb-1 text-sm font-semibold text-ink">Mentor's Comment</h3>
          <p className="text-sm text-ink-muted">{data.mentorComment}</p>
        </div>
      )}

      <div className="card">
        <div className="border-b border-edge px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink">My Tasks</h3>
        </div>
        <div className="divide-y divide-edge">
          {!loadingTasks && (tasks?.items ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No tasks assigned yet</p>}
          {(tasks?.items ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-ink">{t.title}</span>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span>Due {new Date(t.dueDate).toDateString()}</span>
                <Badge tone={t.status === 'Completed' ? 'green' : t.status === 'Late' ? 'red' : 'slate'}>{t.status ?? '-'}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
