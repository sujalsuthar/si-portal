import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';
import { StudentSearchPicker } from '@/components/StudentSearchPicker';

const CATEGORIES = ['DISCIPLINE', 'PARTICIPATION', 'TEAMWORK', 'LEADERSHIP', 'RESPONSIBILITY', 'PROFESSIONALISM'];
const MAX_BEHAVIOUR_POINTS = 5;

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
  const [studentLabel, setStudentLabel] = useState('');
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
    if (!form.studentId) return toast.error('Select a student from the search results');
    if (!form.reason.trim() || form.reason.trim().length < 5) return toast.error('Enter a reason (at least 5 characters)');
    const pts = Number(form.points);
    if (!pts || pts < 1 || pts > MAX_BEHAVIOUR_POINTS) return toast.error(`Points must be between 1 and ${MAX_BEHAVIOUR_POINTS}`);
    try {
      await api.post('/behaviour', { ...form, points: pts });
      toast.success('Behaviour event recorded');
      setRecordOpen(false);
      setForm({ studentId: '', category: 'PARTICIPATION', type: 'POSITIVE', points: '3', reason: '' });
      setStudentLabel('');
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
    if (!editForm.reason.trim() || editForm.reason.trim().length < 5) return toast.error('Enter a reason (at least 5 characters)');
    const pts = Number(editForm.points);
    if (!pts || pts < 1 || pts > MAX_BEHAVIOUR_POINTS) return toast.error(`Points must be between 1 and ${MAX_BEHAVIOUR_POINTS}`);
    try {
      await api.patch(`/behaviour/${editTarget.id}`, { ...editForm, points: pts });
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
          <select className="input h-8 w-44 max-lg:w-full" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
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
          <label className="block"><span className="label">Points (1–{MAX_BEHAVIOUR_POINTS})</span><input className="input" type="number" min={1} max={MAX_BEHAVIOUR_POINTS} value={editForm.points} onChange={(e) => setEditForm((f) => ({ ...f, points: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={2} value={editForm.reason} onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))} /><span className="mt-1 block text-xs text-ink-muted">At least 5 characters</span></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveEdit}>Save</button></div>
        </div>
      </Modal>

      <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record Behaviour Event">
        <div className="space-y-3">
          <StudentSearchPicker
            studentId={form.studentId}
            selectedLabel={studentLabel}
            enabled={recordOpen}
            onSelect={(id, label) => { setForm((f) => ({ ...f, studentId: id })); setStudentLabel(label); }}
            onClear={() => { setForm((f) => ({ ...f, studentId: '' })); setStudentLabel(''); }}
          />
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
          <label className="block"><span className="label">Points (1–{MAX_BEHAVIOUR_POINTS})</span><input className="input" type="number" min={1} max={MAX_BEHAVIOUR_POINTS} value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /><span className="mt-1 block text-xs text-ink-muted">At least 5 characters</span></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={recordEvent}>Save</button></div>
        </div>
      </Modal>
    </div>
  );
}

export function SelfBehaviourView({ studentId }: { studentId?: string }) {
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
