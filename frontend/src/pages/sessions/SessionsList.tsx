import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

const SESSION_TYPES = [
  { value: 'LECTURE', label: 'Session - Theory' },
  { value: 'PRACTICE', label: 'Session - Practical' },
  { value: 'EXAM_THEORY', label: 'Exam - Theory' },
  { value: 'EXAM_PRACTICAL', label: 'Exam - Practical' },
  { value: 'TASK', label: 'Session - Task' },
];

function sessionTypeLabel(value: string | undefined) {
  return SESSION_TYPES.find((t) => t.value === value)?.label ?? value ?? '-';
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SessionsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fullWeekOpen, setFullWeekOpen] = useState(false);
  const [editSession, setEditSession] = useState<any>(null);
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);

  const { data, isLoading } = useQuery({ queryKey: ['sessions'], queryFn: async () => (await api.get('/sessions', { params: { pageSize: 50 } })).data });
  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data, enabled: createOpen || fullWeekOpen });
  const { data: faculty } = useQuery({ queryKey: ['faculty', 'all'], queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100, activeOnly: true } })).data, enabled: createOpen || fullWeekOpen || !!editSession });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      await api.post('/sessions', { ...values, durationMinutes: Number(values.durationMinutes) });
      toast.success('Session scheduled');
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle="Class schedule, topics and attendance."
        actions={
          canCreate && (
            <>
              <button className="btn-secondary" onClick={() => setFullWeekOpen(true)}>+ Full Week Session</button>
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Schedule Session</button>
            </>
          )
        }
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Date', cell: (r: any) => new Date(r.sessionDate).toLocaleString() },
          { header: 'Batch', cell: (r: any) => <button className="text-brand-ink hover:underline font-medium" onClick={() => navigate(`/sessions/${r.id}`)}>{r.batch.name}</button> },
          { header: 'Topic', cell: (r: any) => <>{r.topic} - <span className="text-ink-muted">{r.description}</span></> },
          { header: 'Type', cell: (r: any) => sessionTypeLabel(r.sessionType) },
          { header: 'Trainer', cell: (r: any) => `${r.faculty.firstName} ${r.faculty.lastName}` },
          { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'CANCELLED' ? 'red' : 'blue'}>{r.status}</Badge> },
          ...(canCreate
            ? [{ header: '', cell: (r: any) => <button className="btn-secondary" onClick={() => setEditSession(r)}>Edit</button> }]
            : []),
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Schedule Session">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block">
            <span className="label">Batch</span>
            <select className="input" {...register('batchId', { required: true })}>
              <option value="">Select…</option>
              {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Trainer</span>
            <select className="input" {...register('facultyId', { required: true })}>
              <option value="">Select team member…</option>
              {faculty?.items?.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Topic</span><input className="input" {...register('topic', { required: true })} /></label>
          <label className="block"><span className="label">Description</span><textarea className="input" rows={2} {...register('description', { required: true })} /></label>
          <label className="block">
            <span className="label">Session Type</span>
            <select className="input" {...register('sessionType')}>
              {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Date &amp; Time</span><input className="input" type="datetime-local" {...register('sessionDate', { required: true })} /></label>
          <label className="block"><span className="label">Duration (minutes)</span><input className="input" type="number" defaultValue={120} {...register('durationMinutes', { required: true })} /></label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Schedule</button>
          </div>
        </form>
      </Modal>

      {fullWeekOpen && (
        <FullWeekModal
          batches={batches?.items ?? []}
          faculty={faculty?.items ?? []}
          onClose={() => setFullWeekOpen(false)}
          onCreated={() => {
            setFullWeekOpen(false);
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
          }}
        />
      )}

      {editSession && (
        <EditSessionModal
          session={editSession}
          faculty={faculty?.items ?? []}
          onClose={() => setEditSession(null)}
          onSaved={() => {
            setEditSession(null);
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
          }}
        />
      )}
    </div>
  );
}

function EditSessionModal({ session, faculty, onClose, onSaved }: { session: any; faculty: any[]; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      batchId: session.batchId,
      facultyId: session.facultyId,
      topic: session.topic,
      description: session.description,
      sessionType: session.sessionType,
      sessionDate: toLocalDateTimeInput(session.sessionDate),
      durationMinutes: session.durationMinutes,
    },
  });

  async function onSubmit(values: any) {
    try {
      await api.put(`/sessions/${session.id}`, { ...values, durationMinutes: Number(values.durationMinutes) });
      toast.success('Session updated');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Session">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <label className="block">
          <span className="label">Trainer</span>
          <select className="input" {...register('facultyId')}>
            {faculty.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Topic</span><input className="input" {...register('topic', { required: true })} /></label>
        <label className="block"><span className="label">Description</span><textarea className="input" rows={2} {...register('description', { required: true })} /></label>
        <label className="block">
          <span className="label">Session Type</span>
          <select className="input" {...register('sessionType')}>
            {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Date &amp; Time</span><input className="input" type="datetime-local" {...register('sessionDate', { required: true })} /></label>
        <label className="block"><span className="label">Duration (minutes)</span><input className="input" type="number" {...register('durationMinutes', { required: true })} /></label>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
}

function toLocalDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 1 ? 0 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function FullWeekModal({ batches, faculty, onClose, onCreated }: { batches: any[]; faculty: any[]; onClose: () => void; onCreated: () => void }) {
  const [batchId, setBatchId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [sessionType, setSessionType] = useState('LECTURE');
  const [duration, setDuration] = useState(120);
  const [weekStart, setWeekStart] = useState(nextMonday());
  const [days, setDays] = useState(
    WEEKDAYS.map((_, i) => ({ enabled: i < 5, time: '10:00', topic: '', description: '' })),
  );
  const [submitting, setSubmitting] = useState(false);

  function updateDay(i: number, patch: Partial<(typeof days)[number]>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function onSubmit() {
    const active = days.map((d, i) => ({ ...d, i })).filter((d) => d.enabled);
    if (!batchId || !facultyId || active.length === 0) {
      toast.error('Select a batch, team member, and at least one day');
      return;
    }
    const base = new Date(weekStart + 'T00:00:00');
    const sessions = active.map(({ i, time, topic, description }) => {
      const date = new Date(base);
      date.setDate(date.getDate() + i);
      const [h, m] = time.split(':').map(Number);
      date.setHours(h, m, 0, 0);
      return {
        batchId,
        facultyId,
        topic: topic || `${WEEKDAYS[i]} Session`,
        description: description || `${WEEKDAYS[i]} session`,
        sessionType,
        sessionDate: date.toISOString(),
        durationMinutes: Number(duration),
      };
    });

    setSubmitting(true);
    try {
      await api.post('/sessions/bulk', { sessions });
      toast.success(`${sessions.length} sessions scheduled for the week`);
      onCreated();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Full Week Session" wide>
      <div className="space-y-4">
        <div className="form-grid">
          <label className="block">
            <span className="label">Batch</span>
            <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Select…</option>
              {batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Trainer</span>
            <select className="input" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} required>
              <option value="">Select team member…</option>
              {faculty.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Session Type</span>
            <select className="input" value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
              {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Duration (minutes)</span>
            <input className="input" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Week Starting (Monday)</span>
            <input className="input" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
        </div>

        <div className="space-y-2">
          {days.map((d, i) => (
            <div key={i} className="flex items-center rounded-lg border border-edge p-2 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">
              <label className="flex shrink-0 items-center gap-2 sm:w-28">
                <input type="checkbox" checked={d.enabled} onChange={(e) => updateDay(i, { enabled: e.target.checked })} />
                <span className="text-sm font-medium text-ink">{WEEKDAYS[i]}</span>
              </label>
              <input className="input w-28 max-lg:w-full" type="time" value={d.time} disabled={!d.enabled} onChange={(e) => updateDay(i, { time: e.target.value })} />
              <input className="input min-w-0 flex-1" placeholder="Topic" disabled={!d.enabled} value={d.topic} onChange={(e) => updateDay(i, { topic: e.target.value })} />
              <input className="input min-w-0 flex-1" placeholder="Description" disabled={!d.enabled} value={d.description} onChange={(e) => updateDay(i, { description: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>{submitting ? 'Scheduling…' : 'Schedule Week'}</button>
        </div>
      </div>
    </Modal>
  );
}
