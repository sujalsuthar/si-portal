import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/auth/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Badge, Spinner, Modal } from '@/components/ui';

const SESSION_TYPES = [
  { value: 'LECTURE', label: 'Session - Theory' },
  { value: 'PRACTICE', label: 'Session - Practical' },
  { value: 'EXAM_THEORY', label: 'Exam - Theory' },
  { value: 'EXAM_PRACTICAL', label: 'Exam - Practical' },
  { value: 'TASK', label: 'Session - Task' },
];

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_TONE: Record<Status, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  PRESENT: 'green',
  ABSENT: 'red',
  LATE: 'amber',
  LEAVE: 'blue',
  EXCUSED: 'slate',
};

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);

  const { data: session, isLoading } = useQuery({ queryKey: ['session', id], queryFn: async () => (await api.get(`/sessions/${id}`)).data });
  const { data: faculty } = useQuery({
    queryKey: ['faculty', 'all'],
    queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100, activeOnly: true } })).data,
    enabled: editOpen,
  });
  const { data: roster } = useQuery({
    queryKey: ['students', 'batch', session?.batchId],
    queryFn: async () => (await api.get('/students', { params: { batchId: session.batchId, pageSize: 200, status: 'ACTIVE' } })).data,
    enabled: !!session?.batchId,
  });

  useEffect(() => {
    if (!session || !roster) return;
    const existing: Record<string, Status> = {};
    for (const a of session.attendances) existing[a.studentId] = a.status;
    for (const s of roster.items) if (!existing[s.id]) existing[s.id] = 'PRESENT';
    setStatuses(existing);
  }, [session, roster]);

  if (isLoading || !session) return <Spinner />;

  async function saveAttendance() {
    setSaving(true);
    try {
      const records = Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }));
      await api.post(`/attendance/session/${id}/bulk`, { records });
      toast.success('Attendance saved');
      queryClient.invalidateQueries({ queryKey: ['session', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={session.topic}
        subtitle={`${session.batch.name} · ${new Date(session.sessionDate).toLocaleString()} · ${session.faculty.firstName} ${session.faculty.lastName}`}
        actions={
          <>
            <Badge tone={session.status === 'COMPLETED' ? 'green' : 'blue'}>{session.status}</Badge>
            {canEdit && <button className="btn-secondary" onClick={() => setEditOpen(true)}>Edit Session</button>}
          </>
        }
      />

      {editOpen && (
        <EditSessionModal
          session={session}
          faculty={faculty?.items ?? []}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['session', id] });
          }}
        />
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Attendance</h2>
          <button className="btn-primary" onClick={saveAttendance} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</button>
        </div>
        <div className="divide-y divide-edge">
          {(roster?.items ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-ink">{s.firstName} {s.lastName} <span className="text-ink-muted font-normal">({s.studentCode})</span></span>
              <div className="flex gap-1">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: st }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      statuses[s.id] === st ? badgeActiveClass(STATUS_TONE[st]) : 'bg-surface-muted text-ink-muted hover:opacity-75'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {(!roster || roster.items.length === 0) && <p className="px-4 py-6 text-center text-sm text-ink-muted">No students in this batch</p>}
        </div>
      </div>
    </div>
  );
}

function badgeActiveClass(tone: 'green' | 'red' | 'amber' | 'slate' | 'blue') {
  return {
    green: 'bg-emerald-700 text-white',
    red: 'bg-red-600 text-white',
    amber: 'bg-amber-700 text-white',
    slate: 'bg-slate-600 text-white',
    blue: 'bg-brand-600 text-ink',
  }[tone];
}

function toLocalDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditSessionModal({ session, faculty, onClose, onSaved }: { session: any; faculty: any[]; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
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
            <option value={session.facultyId}>{session.faculty.firstName} {session.faculty.lastName}</option>
            {faculty.filter((f: any) => f.id !== session.facultyId).map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
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
