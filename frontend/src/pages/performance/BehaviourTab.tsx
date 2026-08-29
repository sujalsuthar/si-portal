import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';

const CATEGORIES = ['DISCIPLINE', 'PARTICIPATION', 'TEAMWORK', 'LEADERSHIP', 'RESPONSIBILITY', 'PROFESSIONALISM'];

export default function BehaviourTab() {
  const { user } = useAuth();
  const isStaff = user && ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);

  if (isStaff) return <StaffBehaviourView />;
  return <SelfBehaviourView studentId={user!.profile?.id} />;
}

function StaffBehaviourView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canAuthorize = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const [studentType, setStudentType] = useState<'STUDENT' | 'INTERN'>('STUDENT');
  const [batchFilter, setBatchFilter] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [form, setForm] = useState({ studentId: '', category: 'PARTICIPATION', type: 'POSITIVE', points: '3', reason: '' });
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ category: '', type: '', points: '', reason: '' });

  const { data: batches } = useQuery({
    queryKey: ['batches', 'active'],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 100, status: 'ACTIVE' } })).data,
  });
  const { data: events, isLoading } = useQuery({
    queryKey: ['behaviour', studentType, batchFilter],
    queryFn: async () => (await api.get('/behaviour', { params: { studentType, ...(batchFilter ? { batchId: batchFilter } : {}) } })).data,
  });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch, studentType],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, studentType, pageSize: 10 } })).data,
    enabled: recordOpen && studentSearch.length > 1,
  });

  async function authorizeEvent(id: string) {
    try {
      await api.patch(`/behaviour/${id}/authorize`);
      toast.success('Behaviour event authorized');
      queryClient.invalidateQueries({ queryKey: ['behaviour'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function recordEvent() {
    if (!form.studentId || !form.reason) return toast.error('Select a student and enter a reason');
    try {
      await api.post('/behaviour', { ...form, points: Number(form.points) });
      toast.success('Behaviour event recorded');
      setRecordOpen(false);
      setForm({ studentId: '', category: 'PARTICIPATION', type: 'POSITIVE', points: '3', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['behaviour'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openEdit(event: any) {
    setEditTarget(event);
    setEditForm({ category: event.category, type: event.type, points: String(Math.abs(event.points)), reason: event.reason });
  }

  async function saveEdit() {
    if (!editTarget) return;
    try {
      await api.patch(`/behaviour/${editTarget.id}`, { ...editForm, points: Number(editForm.points) });
      toast.success('Behaviour event updated');
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['behaviour'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 text-xs">
            {(['STUDENT', 'INTERN'] as const).map((t) => (
              <button
                key={t}
                className={`rounded-full px-3 py-1 ${studentType === t ? 'bg-brand-600 text-ink' : 'bg-surface-muted text-ink-muted'}`}
                onClick={() => setStudentType(t)}
              >
                {t === 'STUDENT' ? 'Students Behaviour' : 'Interns Behaviour'}
              </button>
            ))}
          </div>
          <select className="input h-8 w-full text-xs sm:w-44" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">All batches</option>
            {(batches?.items ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={() => setRecordOpen(true)}>+ Record Event</button>
      </div>
      <Table
        loading={isLoading}
        rows={events ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Date', cell: (r: any) => new Date(r.eventDate).toLocaleDateString() },
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          { header: 'Category', cell: (r: any) => r.category },
          { header: 'Points', cell: (r: any) => <Badge tone={r.points >= 0 ? 'green' : 'red'}>{r.points >= 0 ? '+' : ''}{r.points}</Badge> },
          { header: 'Reason', cell: (r: any) => r.reason },
          {
            header: '',
            cell: (r: any) => (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" className="text-brand-ink hover:underline" onClick={() => openEdit(r)}>Edit</button>
                {canAuthorize && !r.authorizedById && (
                  <button type="button" className="text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => authorizeEvent(r.id)}>Authorize</button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Behaviour Event">
        <div className="space-y-3">
          <div className="form-grid">
            <label className="block">
              <span className="label">Category</span>
              <select className="input" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="POSITIVE">Positive</option>
                <option value="NEGATIVE">Negative</option>
              </select>
            </label>
          </div>
          <label className="block"><span className="label">Points</span><input className="input" type="number" value={editForm.points} onChange={(e) => setEditForm((f) => ({ ...f, points: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={2} value={editForm.reason} onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveEdit}>Save</button></div>
        </div>
      </Modal>

      <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record Behaviour Event">
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
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${form.studentId === s.id ? 'bg-brand-50' : ''}`}
                    onClick={() => { setForm((f) => ({ ...f, studentId: s.id })); setStudentSearch(`${s.firstName} ${s.lastName}`); }}
                  >
                    {s.firstName} {s.lastName} ({s.studentCode})
                  </button>
                ))}
              </div>
            )}
          </label>
          <div className="form-grid">
            <label className="block">
              <span className="label">Category</span>
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="POSITIVE">Positive</option>
                <option value="NEGATIVE">Negative</option>
              </select>
            </label>
          </div>
          <label className="block"><span className="label">Points</span><input className="input" type="number" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={recordEvent}>Save</button></div>
        </div>
      </Modal>
    </div>
  );
}

function SelfBehaviourView({ studentId }: { studentId?: string }) {
  const { data } = useQuery({
    queryKey: ['behaviour', 'summary', studentId],
    queryFn: async () => (await api.get(`/behaviour/student/${studentId}/monthly-summary`)).data,
    enabled: !!studentId,
  });
  if (!data) return null;
  return (
    <div>
      <Table
        rows={data.recentEvents}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Date', cell: (r: any) => new Date(r.eventDate).toLocaleDateString() },
          { header: 'Category', cell: (r: any) => r.category },
          { header: 'Points', cell: (r: any) => <Badge tone={r.points >= 0 ? 'green' : 'red'}>{r.points >= 0 ? '+' : ''}{r.points}</Badge> },
          { header: 'Reason', cell: (r: any) => r.reason },
        ]}
      />
    </div>
  );
}
