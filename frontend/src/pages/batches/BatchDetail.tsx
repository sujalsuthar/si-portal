import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, StatCard, Table, Badge, Modal } from '@/components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BatchDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [timetableDraft, setTimetableDraft] = useState<any[]>([]);
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showRanking, setShowRanking] = useState(false);

  const { data: batch } = useQuery({ queryKey: ['batch', id], queryFn: async () => (await api.get(`/batches/${id}`)).data });
  const { data: summary } = useQuery({ queryKey: ['batch', id, 'summary'], queryFn: async () => (await api.get(`/batches/${id}/summary`)).data });
  const { data: students } = useQuery({ queryKey: ['batch', id, 'students'], queryFn: async () => (await api.get('/students', { params: { batchId: id, pageSize: 100 } })).data });
  const { data: unassignedStudents } = useQuery({
    queryKey: ['students', 'unassigned'],
    queryFn: async () => (await api.get('/students', { params: { pageSize: 200 } })).data,
    enabled: bulkAddOpen,
  });
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['batch', id, 'ranking'],
    queryFn: async () => (await api.get(`/batches/${id}/ranking`)).data,
    enabled: showRanking,
  });

  if (!batch) return null;

  async function saveTimetable() {
    try {
      await api.put(`/batches/${id}/timetable`, {
        slots: timetableDraft.map((s) => ({
          dayOfWeek: Number(s.dayOfWeek),
          startTime: s.startTime,
          endTime: s.endTime,
          subject: s.subject,
          meetingLink: s.meetingLink || undefined,
        })),
      });
      toast.success('Timetable updated');
      setTimetableOpen(false);
      queryClient.invalidateQueries({ queryKey: ['batch', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openTimetableEditor() {
    setTimetableDraft(
      batch.timetableSlots.length > 0
        ? batch.timetableSlots.map((s: any) => ({ ...s }))
        : [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subject: '', meetingLink: '' }],
    );
    setTimetableOpen(true);
  }

  function addTimetableRow() {
    setTimetableDraft((rows) => [...rows, { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subject: '', meetingLink: '' }]);
  }

  function removeTimetableRow(index: number) {
    setTimetableDraft((rows) => rows.filter((_, i) => i !== index));
  }

  async function bulkAddStudents() {
    if (selectedStudentIds.length === 0) return toast.error('Select at least one student');
    try {
      const res = await api.post(`/batches/${id}/students/bulk-add`, { studentIds: selectedStudentIds });
      toast.success(`${res.data.addedCount} student(s) added to this batch`);
      setBulkAddOpen(false);
      setSelectedStudentIds([]);
      queryClient.invalidateQueries({ queryKey: ['batch', id, 'students'] });
      queryClient.invalidateQueries({ queryKey: ['batch', id, 'summary'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => (prev.includes(studentId) ? prev.filter((i) => i !== studentId) : [...prev, studentId]));
  }

  async function runFinalBackup() {
    try {
      toast.loading('Archiving batch data…', { id: 'final-backup' });
      await api.post(`/batches/${id}/final-backup`);
      toast.success('Final backup created. Find it under Backup.', { id: 'final-backup' });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Backup failed'), { id: 'final-backup' });
    }
  }

  return (
    <div>
      <PageHeader
        title={batch.name}
        subtitle={`${batch.course.name} · Started ${new Date(batch.startDate).toDateString()}`}
        actions={
          <>
            {user?.role === 'SUPER_ADMIN' && batch.eligibleForFinalBackup && (
              <button className="btn-secondary" onClick={runFinalBackup} title="This batch is past the retention age - archive its data one final time before any retention job removes it.">
                Final Backup Before Archive
              </button>
            )}
            <Badge tone={batch.status === 'ACTIVE' ? 'green' : 'slate'}>{batch.status}</Badge>
          </>
        }
      />

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Strength" value={summary.strength} />
          <StatCard label="Avg Attendance" value={`${summary.averageAttendancePct}%`} tone={summary.averageAttendancePct < 75 ? 'warn' : 'good'} />
          <StatCard label="Avg Exam Score" value={`${summary.averageExamScorePct}%`} />
          <StatCard label="Task Completion" value={`${summary.taskCompletionPct}%`} />
          <StatCard label="Presentation Completion" value={`${summary.presentationCompletionPct}%`} />
          <StatCard label="Certifications Passed" value={`${summary.certificationProgress.passed}/${summary.certificationProgress.total}`} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Students ({students?.items?.length ?? 0})</h2>
            {canManage && <button className="btn-secondary text-xs" onClick={() => setBulkAddOpen(true)}>Bulk Add Students</button>}
          </div>
          <Table
            rows={students?.items ?? []}
            keyFn={(r: any) => r.id}
            columns={[
              { header: 'Name', cell: (r: any) => <Link className="text-brand-ink hover:underline font-medium" to={`/people/students/${r.id}`}>{r.firstName} {r.lastName}</Link> },
              { header: 'Code', cell: (r: any) => r.studentCode },
              { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge> },
            ]}
          />

          <div className="mb-3 mt-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Ranking</h2>
            <button className="text-xs text-brand-ink hover:underline" onClick={() => setShowRanking((v) => !v)}>
              {showRanking ? 'Hide' : 'Show'} ranking
            </button>
          </div>
          {showRanking && (
            <div className="card divide-y divide-edge">
              {rankingLoading && <p className="px-4 py-6 text-center text-sm text-ink-muted">Loading…</p>}
              {!rankingLoading && (ranking ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No active students to rank</p>}
              {(ranking ?? []).map((r: any, i: number) => (
                <Link key={r.id} to={`/people/students/${r.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-muted">
                  <span className="flex items-center gap-2">
                    <Badge tone={i === 0 ? 'amber' : 'slate'}>#{i + 1}</Badge>
                    <span className="font-medium text-ink">{r.firstName} {r.lastName}</span>
                    <span className="text-xs text-ink-muted">{r.studentCode}</span>
                  </span>
                  <span className="font-medium text-ink">{r.composite}%</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Timetable</h2>
            {canManage && <button className="text-xs text-brand-ink hover:underline" onClick={openTimetableEditor}>Edit timetable</button>}
          </div>
          <div className="card divide-y divide-edge">
            {batch.timetableSlots.length === 0 && <p className="px-4 py-4 text-center text-sm text-ink-muted">No timetable slots</p>}
            {batch.timetableSlots.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}</span>
                <span className="text-ink-muted">
                  {s.subject}
                  {s.meetingLink && (
                    <a className="ml-2 text-brand-ink hover:underline" href={s.meetingLink} target="_blank" rel="noreferrer">Join link</a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} title="Bulk Add Students to Batch" wide>
        {canManage && (
          <div className="mb-4 flex gap-1 border-b border-edge">
            {(['existing', 'new'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAddMode(t)}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${addMode === t ? 'border-brand-600 text-brand-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                {t === 'existing' ? 'Move existing students' : '+ New student'}
              </button>
            ))}
          </div>
        )}

        {addMode === 'existing' ? (
          <>
            <p className="mb-3 text-sm text-ink-muted">Select one or more students to move into this batch (and its course).</p>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {(unassignedStudents?.items ?? [])
                .filter((s: any) => s.currentBatch?.id !== id)
                .map((s: any) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted">
                    <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                    <span className="text-ink">{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-ink-muted">{s.studentCode}{s.currentBatch ? ` · currently in ${s.currentBatch.name}` : ''}</span>
                  </label>
                ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setBulkAddOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={bulkAddStudents}>Add {selectedStudentIds.length > 0 ? `(${selectedStudentIds.length})` : ''}</button>
            </div>
          </>
        ) : (
          <NewStudentForm
            batchId={id!}
            courseId={batch.courseId}
            onCreated={(tempPassword) => {
              toast.success(`Student created. Temp password: ${tempPassword}`, { duration: 8000 });
              setBulkAddOpen(false);
              queryClient.invalidateQueries({ queryKey: ['batch', id, 'students'] });
              queryClient.invalidateQueries({ queryKey: ['batch', id, 'summary'] });
            }}
            onCancel={() => setBulkAddOpen(false)}
          />
        )}
      </Modal>

      <Modal open={timetableOpen} onClose={() => setTimetableOpen(false)} title="Edit Timetable" wide>
        <div className="space-y-3">
          {timetableDraft.map((slot, index) => (
            <div key={index} className="form-grid items-end">
              <label className="block">
                <span className="label">Day</span>
                <select className="input" value={slot.dayOfWeek} onChange={(e) => setTimetableDraft((rows) => rows.map((r, i) => (i === index ? { ...r, dayOfWeek: Number(e.target.value) } : r)))}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">Start</span><input className="input" value={slot.startTime} onChange={(e) => setTimetableDraft((rows) => rows.map((r, i) => (i === index ? { ...r, startTime: e.target.value } : r)))} placeholder="09:00" /></label>
              <label className="block"><span className="label">End</span><input className="input" value={slot.endTime} onChange={(e) => setTimetableDraft((rows) => rows.map((r, i) => (i === index ? { ...r, endTime: e.target.value } : r)))} placeholder="10:00" /></label>
              <label className="block"><span className="label">Subject</span><input className="input" value={slot.subject} onChange={(e) => setTimetableDraft((rows) => rows.map((r, i) => (i === index ? { ...r, subject: e.target.value } : r)))} /></label>
              <label className="block"><span className="label">Meeting link (Sun only)</span><input className="input" value={slot.meetingLink ?? ''} onChange={(e) => setTimetableDraft((rows) => rows.map((r, i) => (i === index ? { ...r, meetingLink: e.target.value } : r)))} /></label>
              <button type="button" className="btn-secondary text-xs" onClick={() => removeTimetableRow(index)}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn-secondary text-xs" onClick={addTimetableRow}>+ Add slot</button>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setTimetableOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveTimetable}>Save Timetable</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewStudentForm({ batchId, courseId, onCreated, onCancel }: { batchId: string; courseId: string; onCreated: (tempPassword: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', studentCode: '', consentGranted: false });

  async function submit() {
    if (!form.firstName || !form.lastName || !form.email || !form.studentCode) return toast.error('Fill in all fields');
    if (!form.consentGranted) return toast.error('Data processing consent is required to enrol a student');
    try {
      const res = await api.post('/students', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        studentCode: form.studentCode,
        courseId,
        currentBatchId: batchId,
        dataProcessingConsent: { granted: true, noticeVersion: 'v1' },
      });
      onCreated(res.data.tempPassword);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <label className="block"><span className="label">First Name</span><input className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></label>
      <label className="block"><span className="label">Last Name</span><input className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></label>
      <label className="block"><span className="label">Email</span><input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
      <label className="block"><span className="label">Student Code</span><input className="input" value={form.studentCode} onChange={(e) => setForm((f) => ({ ...f, studentCode: e.target.value }))} /></label>
      <label className="flex items-start gap-2 text-sm text-ink-muted">
        <input type="checkbox" className="mt-0.5" checked={form.consentGranted} onChange={(e) => setForm((f) => ({ ...f, consentGranted: e.target.checked }))} />
        <span>The student (or their guardian) has given consent for the institute to process their personal data. Enrolment cannot proceed without this.</span>
      </label>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Create & Add to Batch</button>
      </div>
    </div>
  );
}
