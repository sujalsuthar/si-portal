import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';

export default function StudentOfMonthTab() {
  const { user } = useAuth();
  const canEdit = user && ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN'].includes(user.role);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ studentId: '', score: '' });
  const [studentSearch, setStudentSearch] = useState('');

  const { data: awards, isLoading } = useQuery({ queryKey: ['student-of-month', period], queryFn: async () => (await api.get('/student-of-month', { params: { period } })).data });
  const { data: leaderboard } = useQuery({
    queryKey: ['student-of-month', 'leaderboard', 'intern'],
    queryFn: async () => (await api.get('/student-of-month/leaderboard', { params: { studentType: 'INTERN' } })).data,
  });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, studentType: 'INTERN', pageSize: 10 } })).data,
    enabled: !!editTarget && studentSearch.length > 1,
  });

  async function computeAwards() {
    try {
      await api.post('/student-of-month/compute', { period });
      toast.success('Awards computed for this period');
      queryClient.invalidateQueries({ queryKey: ['student-of-month'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openEdit(award: any) {
    setEditTarget(award);
    setEditForm({ studentId: award.studentId, score: String(award.score) });
    setStudentSearch(`${award.student.firstName} ${award.student.lastName}`);
  }

  async function saveEdit() {
    if (!editTarget) return;
    try {
      await api.patch(`/student-of-month/${editTarget.id}`, { studentId: editForm.studentId, score: Number(editForm.score) });
      toast.success('Award updated');
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['student-of-month'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input className="input w-40" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <button className="btn-primary" onClick={computeAwards}>Compute Awards</button>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink">Awards - {period}</h2>
      <Table
        loading={isLoading}
        rows={awards ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Category', cell: (r: any) => <Badge tone={r.category === 'TOP_PERFORMER' ? 'green' : 'blue'}>{r.category === 'TOP_PERFORMER' ? 'Top Performer' : 'Most Improved'}</Badge> },
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          { header: 'Score', cell: (r: any) => r.score.toFixed(1) },
          ...(canEdit ? [{ header: '', cell: (r: any) => <button className="text-xs text-brand-ink hover:underline" onClick={() => openEdit(r)}>Edit</button> }] : []),
        ]}
      />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Award">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Student</span>
            <input className="input" placeholder="Search intern…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            {studentResults?.items?.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-edge">
                {studentResults.items.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${editForm.studentId === s.id ? 'bg-brand-50' : ''}`}
                    onClick={() => { setEditForm((f) => ({ ...f, studentId: s.id })); setStudentSearch(`${s.firstName} ${s.lastName}`); }}
                  >
                    {s.firstName} {s.lastName} ({s.studentCode})
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block"><span className="label">Score</span><input className="input" type="number" min={0} max={100} value={editForm.score} onChange={(e) => setEditForm((f) => ({ ...f, score: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveEdit}>Save</button></div>
        </div>
      </Modal>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Current Intern Leaderboard</h2>
      <Table
        rows={leaderboard ?? []}
        keyFn={(r: any) => r.student.id}
        columns={[
          { header: '#', cell: (_r: any, i: number) => i + 1 },
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          { header: 'Batch', cell: (r: any) => r.student.currentBatch?.name ?? '-' },
          { header: 'Composite Score', cell: (r: any) => `${r.composite.toFixed(1)}%` },
        ]}
      />
    </div>
  );
}
