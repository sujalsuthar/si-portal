import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Badge, Spinner, Modal } from '@/components/ui';

export default function MarkSheet() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [marksDraft, setMarksDraft] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [editTarget, setEditTarget] = useState<{ gradeId: string; studentName: string; marksObtained: number } | null>(null);
  const [editForm, setEditForm] = useState({ marksObtained: '', reason: '' });
  const canEnter = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const canReview = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);

  const { data: exam, isLoading } = useQuery({ queryKey: ['exam', id], queryFn: async () => (await api.get(`/exams/${id}`)).data });
  const { data: grades, refetch: refetchGrades } = useQuery({ queryKey: ['grades', 'exam', id], queryFn: async () => (await api.get('/grades', { params: { examId: id } })).data });
  const { data: roster } = useQuery({
    queryKey: ['students', 'batch', exam?.batchId],
    queryFn: async () => (await api.get('/students', { params: { batchId: exam.batchId, pageSize: 200, status: 'ACTIVE' } })).data,
    enabled: !!exam?.batchId,
  });

  if (isLoading || !exam) return <Spinner />;

  const gradeByStudent = new Map((grades ?? []).map((g: any) => [g.studentId, g]));
  const isEditableState = ['DRAFT', 'SCHEDULED', 'COMPLETED', 'REJECTED'].includes(exam.status);
  const rejectionReason = (grades ?? []).find((g: any) => g.rejectionReason)?.rejectionReason;

  async function saveMarks() {
    const records = Object.entries(marksDraft)
      .filter(([, v]) => v !== '')
      .map(([studentId, marksObtained]) => ({ studentId, marksObtained: Number(marksObtained) }));
    if (records.length === 0) return toast.error('Enter marks for at least one student');
    try {
      await api.post(`/grades/exam/${id}/bulk`, { records });
      toast.success('Marks saved');
      setMarksDraft({});
      refetchGrades();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function submitToAdmin() {
    try {
      await api.post(`/exams/${id}/marksheet/submit`);
      toast.success('Mark sheet submitted to Admin for review');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
      refetchGrades();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function accept() {
    try {
      await api.patch(`/exams/${id}/marksheet/accept`);
      toast.success('Mark sheet accepted and published to students/parents');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
      refetchGrades();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function reject() {
    if (rejectReason.trim().length < 3) return toast.error('Enter a reason (at least 3 characters)');
    try {
      await api.patch(`/exams/${id}/marksheet/reject`, { reason: rejectReason });
      toast.success('Mark sheet rejected and sent back to the teacher');
      setRejectOpen(false);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
      refetchGrades();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openEdit(gradeId: string, studentName: string, marksObtained: number) {
    setEditTarget({ gradeId, studentName, marksObtained });
    setEditForm({ marksObtained: String(marksObtained), reason: '' });
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (editForm.reason.trim().length < 3) return toast.error('Enter a reason (at least 3 characters)');
    try {
      await api.patch(`/grades/${editTarget.gradeId}`, { marksObtained: Number(editForm.marksObtained), reason: editForm.reason });
      toast.success('Marks updated');
      setEditTarget(null);
      refetchGrades();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title={`Mark Sheet - ${exam.title}`}
        subtitle={`${exam.batch.name} · ${exam.subject} · Total Marks: ${exam.totalMarks}`}
        actions={<Badge tone={exam.status === 'PUBLISHED' ? 'green' : exam.status === 'REJECTED' ? 'red' : exam.status === 'GRADED' ? 'amber' : 'blue'}>{exam.status}</Badge>}
      />

      {exam.status === 'REJECTED' && rejectionReason && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <strong>Rejected by Admin:</strong> {rejectionReason}
        </div>
      )}

      {exam.status === 'GRADED' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span>This mark sheet has been submitted and is awaiting Admin review.</span>
          {canReview && (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setRejectOpen(true)}>Reject</button>
              <button className="btn-primary" onClick={accept}>Accept &amp; Publish</button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Student Marks</h2>
          {canEnter && isEditableState && (
            <div className="flex gap-2">
              <button className="text-xs text-brand-ink hover:underline" onClick={saveMarks}>Save Marks</button>
              <button className="btn-primary" onClick={submitToAdmin}>Submit to Admin</button>
            </div>
          )}
        </div>
        <div className="divide-y divide-edge">
          {(roster?.items ?? []).map((s: any) => {
            const grade = gradeByStudent.get(s.id) as any;
            const canEditThisGrade = canEnter && grade && (grade.status !== 'PUBLISHED' || canReview);
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium text-ink">{s.firstName} {s.lastName}</span>
                {grade && grade.status !== 'REJECTED' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-ink-muted">{grade.marksObtained}/{exam.totalMarks} ({grade.percentage.toFixed(0)}%)</span>
                    {canEditThisGrade && (
                      <button className="text-xs text-brand-ink hover:underline" onClick={() => openEdit(grade.id, `${s.firstName} ${s.lastName}`, grade.marksObtained)}>Edit</button>
                    )}
                  </div>
                ) : canEnter && isEditableState ? (
                  <input
                    className="input w-24"
                    type="number"
                    placeholder="Marks"
                    defaultValue={grade?.marksObtained ?? ''}
                    value={marksDraft[s.id] ?? (grade?.status === 'REJECTED' ? String(grade.marksObtained) : '')}
                    onChange={(e) => setMarksDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  />
                ) : (
                  <span className="text-ink-muted">-</span>
                )}
              </div>
            );
          })}
          {(!roster || roster.items.length === 0) && <p className="px-4 py-6 text-center text-sm text-ink-muted">No students in this batch</p>}
        </div>
      </div>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Marks - ${editTarget?.studentName ?? ''}`}>
        <div className="space-y-3">
          <label className="block"><span className="label">Marks Obtained</span><input className="input" type="number" value={editForm.marksObtained} onChange={(e) => setEditForm((f) => ({ ...f, marksObtained: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason for change</span><textarea className="input" rows={2} value={editForm.reason} onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveEdit}>Save</button>
          </div>
        </div>
      </Modal>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject Mark Sheet">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Reason for rejection</span>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRejectOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={reject}>Reject</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
