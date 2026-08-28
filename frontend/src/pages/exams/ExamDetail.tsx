import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Badge, Spinner, Modal } from '@/components/ui';

export default function ExamDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addQuestionPaperId, setAddQuestionPaperId] = useState<string | null>(null);
  const [questionSearch, setQuestionSearch] = useState('');
  const [newPaperName, setNewPaperName] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const canManage = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);

  const { data: exam, isLoading } = useQuery({ queryKey: ['exam', id], queryFn: async () => (await api.get(`/exams/${id}`)).data });
  const { data: questionResults } = useQuery({
    queryKey: ['questions', 'search', questionSearch],
    queryFn: async () => (await api.get('/questions', { params: { search: questionSearch, pageSize: 20 } })).data,
    enabled: !!addQuestionPaperId,
  });

  if (isLoading || !exam) return <Spinner />;

  async function addPaper() {
    if (!newPaperName.trim()) return toast.error('Enter a paper name');
    try {
      await api.post(`/exams/${id}/papers`, { name: newPaperName });
      setNewPaperName('');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removePaper(paperId: string) {
    try {
      await api.delete(`/exams/papers/${paperId}`);
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function addQuestion(paperId: string, questionId: string) {
    try {
      await api.post(`/exams/papers/${paperId}/questions`, { questionId });
      toast.success('Question added');
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removeQuestion(paperId: string, examQuestionId: string) {
    try {
      await api.delete(`/exams/papers/${paperId}/questions/${examQuestionId}`);
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function downloadPaper() {
    try {
      const res = await api.get(`/exams/${id}/paper.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exam.title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not generate paper'));
    }
  }

  async function setStatus(status: string) {
    try {
      await api.patch(`/exams/${id}/status`, { status });
      toast.success(`Exam marked ${status}`);
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const canOpenForStudents = canManage && exam.status === 'DRAFT';

  return (
    <div>
      <PageHeader
        title={exam.title}
        subtitle={`${exam.batch.name} · ${exam.subject} · Total Marks: ${exam.totalMarks}`}
        actions={
          <>
            <Link className="btn-secondary" to={`/exams/${id}/marksheet`}>Mark Sheet</Link>
            <button className="btn-secondary" onClick={() => downloadPaper()}>Download Paper</button>
            {canManage && <button className="btn-secondary" onClick={() => setEditOpen(true)}>Edit Exam</button>}
            {canOpenForStudents && (
              <button className="btn-primary" onClick={() => setStatus('SCHEDULED')}>Open for Students</button>
            )}
            {canManage && exam.status === 'SCHEDULED' && (
              <button className="btn-secondary" onClick={() => setStatus('COMPLETED')}>Mark Completed</button>
            )}
            <Badge tone={exam.status === 'PUBLISHED' ? 'green' : exam.status === 'REJECTED' ? 'red' : exam.status === 'GRADED' ? 'amber' : 'blue'}>{exam.status}</Badge>
          </>
        }
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Papers</h2>
          <div className="flex items-center gap-2">
            <input className="input h-8 w-32 text-xs" placeholder="e.g. Practical" value={newPaperName} onChange={(e) => setNewPaperName(e.target.value)} />
            <button className="text-xs text-brand-ink hover:underline" onClick={addPaper}>+ Add Paper</button>
          </div>
        </div>
        <div className="space-y-4">
          {exam.papers.map((paper: any) => (
            <div key={paper.id} className="card">
              <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
                <span className="text-sm font-medium text-ink">{paper.name} ({paper.totalMarks} marks)</span>
                <div className="flex items-center gap-3">
                  <button className="text-xs text-brand-ink hover:underline" onClick={() => setAddQuestionPaperId(paper.id)}>+ Add from bank</button>
                  <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => removePaper(paper.id)}>Remove Paper</button>
                </div>
              </div>
              <div className="divide-y divide-edge">
                {paper.examQuestions.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No questions added yet</p>}
                {paper.examQuestions.map((eq: any) => (
                  <div key={eq.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">Q{eq.sequence}. {eq.question.questionText}</p>
                      <p className="text-xs text-ink-muted">{eq.question.questionType.replace('_', ' ')} · {eq.marks} marks</p>
                    </div>
                    <button className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0" onClick={() => removeQuestion(paper.id, eq.id)}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!addQuestionPaperId} onClose={() => setAddQuestionPaperId(null)} title="Add Question from Bank" wide>
        <input className="input mb-3" placeholder="Search questions…" value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} />
        <div className="max-h-96 divide-y divide-edge overflow-y-auto">
          {(questionResults?.items ?? []).map((q: any) => (
            <div key={q.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p>{q.questionText}</p>
                <p className="text-xs text-ink-muted">{q.marks} marks · {q.questionType.replace('_', ' ')}</p>
              </div>
              <button className="btn-secondary shrink-0" onClick={() => addQuestionPaperId && addQuestion(addQuestionPaperId, q.id)}>Add</button>
            </div>
          ))}
        </div>
      </Modal>

      {editOpen && <EditExamModal exam={exam} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); queryClient.invalidateQueries({ queryKey: ['exam', id] }); }} />}
    </div>
  );
}

function EditExamModal({ exam, onClose, onSaved }: { exam: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title: exam.title,
      subject: exam.subject,
      examDate: exam.examDate ? exam.examDate.slice(0, 10) : '',
      durationMinutes: exam.durationMinutes ?? '',
      passMarks: exam.passMarks ?? '',
    },
  });

  async function onSubmit(values: any) {
    try {
      await api.put(`/exams/${exam.id}`, {
        ...values,
        durationMinutes: values.durationMinutes === '' ? undefined : Number(values.durationMinutes),
        passMarks: values.passMarks === '' ? undefined : Number(values.passMarks),
      });
      toast.success('Exam updated');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Exam">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <label className="block"><span className="label">Title</span><input className="input" {...register('title', { required: true })} /></label>
        <label className="block"><span className="label">Subject</span><input className="input" {...register('subject', { required: true })} /></label>
        <label className="block"><span className="label">Exam Date</span><input className="input" type="date" {...register('examDate')} /></label>
        <label className="block"><span className="label">Duration (minutes)</span><input className="input" type="number" {...register('durationMinutes')} /></label>
        <label className="block"><span className="label">Pass Marks</span><input className="input" type="number" {...register('passMarks')} /></label>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
}
