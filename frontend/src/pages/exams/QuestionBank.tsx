import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

const DEFAULT_MARKS: Record<string, number> = { MCQ: 1, LONG_ANSWER: 10 };

export default function QuestionBank() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({ queryKey: ['questions', search], queryFn: async () => (await api.get('/questions', { params: { search, pageSize: 50 } })).data });
  const { register, handleSubmit, reset, watch, setValue } = useForm<Record<string, any>>({ defaultValues: { questionType: 'MCQ', marks: DEFAULT_MARKS.MCQ } });
  const questionType = watch('questionType');

  const questions = data?.items ?? [];
  const selectedQuestions = questions.filter((q: any) => selectedIds.includes(q.id));
  const totalSelectedMarks = selectedQuestions.reduce((s: number, q: any) => s + q.marks, 0);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onTypeChange(type: string) {
    setValue('questionType', type);
    setValue('marks', DEFAULT_MARKS[type] ?? 1);
  }

  async function onCreate(values: any) {
    try {
      const payload = {
        ...values,
        marks: Number(values.marks),
        options: values.questionType === 'MCQ' ? String(values.optionsRaw ?? '').split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        rubric:
          values.questionType === 'LONG_ANSWER' && values.rubricRaw
            ? String(values.rubricRaw)
                .split('\n')
                .map((line: string) => line.trim())
                .filter(Boolean)
                .map((line: string) => {
                  const [criterion, maxMarks] = line.split('|').map((s) => s.trim());
                  return { criterion, maxMarks: Number(maxMarks) || 0 };
                })
            : undefined,
      };
      delete payload.optionsRaw;
      delete payload.rubricRaw;
      await api.post('/questions', payload);
      toast.success('Question added');
      setCreateOpen(false);
      reset({ questionType: 'MCQ', marks: DEFAULT_MARKS.MCQ });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Question Bank"
        subtitle="Build questions on the left, then assemble them into an exam paper on the right."
        actions={
          <>
            <input className="input w-56" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Question</button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table
            loading={isLoading}
            rows={questions}
            keyFn={(r: any) => r.id}
            columns={[
              {
                header: '',
                cell: (r: any) => <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelected(r.id)} />,
              },
              { header: 'Question', cell: (r: any) => <span className="line-clamp-2 max-w-md">{r.questionText}</span> },
              { header: 'Type', cell: (r: any) => <Badge tone={r.questionType === 'MCQ' ? 'blue' : 'slate'}>{r.questionType.replace('_', ' ')}</Badge> },
              { header: 'Marks', cell: (r: any) => r.marks },
              { header: 'Used', cell: (r: any) => r.usageCount },
            ]}
          />
        </div>

        <div>
          <BuildPaperPanel
            selectedQuestions={selectedQuestions}
            totalSelectedMarks={totalSelectedMarks}
            onRemove={(qid) => setSelectedIds((prev) => prev.filter((x) => x !== qid))}
            onClear={() => setSelectedIds([])}
            onDone={(examId) => {
              setSelectedIds([]);
              queryClient.invalidateQueries({ queryKey: ['exams'] });
              navigate(`/exams/${examId}`);
            }}
          />
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Question" wide>
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Question Text</span><textarea className="input" rows={2} {...register('questionText', { required: true })} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="label">Topic</span><input className="input" {...register('topic')} /></label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={questionType} onChange={(e) => onTypeChange(e.target.value)}>
                <option value="MCQ">Multiple Choice (auto-marked)</option>
                <option value="LONG_ANSWER">Long Answer (rubric-marked)</option>
              </select>
            </label>
            <label className="block"><span className="label">Marks</span><input className="input" type="number" {...register('marks', { required: true })} /></label>
          </div>
          {questionType === 'MCQ' && (
            <>
              <label className="block"><span className="label">Options (comma-separated)</span><input className="input" {...register('optionsRaw')} placeholder="var, let, function, global" /></label>
              <label className="block"><span className="label">Correct Answer</span><input className="input" {...register('correctAnswer')} placeholder="Must match one option exactly" /></label>
            </>
          )}
          {questionType === 'LONG_ANSWER' && (
            <label className="block">
              <span className="label">Rubric (one criterion per line, "criterion | max marks")</span>
              <textarea className="input" rows={3} {...register('rubricRaw')} placeholder={'Correctness | 6\nClarity of explanation | 4'} />
            </label>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add Question</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function BuildPaperPanel({
  selectedQuestions,
  totalSelectedMarks,
  onRemove,
  onClear,
  onDone,
}: {
  selectedQuestions: any[];
  totalSelectedMarks: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onDone: (examId: string) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [examId, setExamId] = useState('');
  const [paperName, setPaperName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newBatchId, setNewBatchId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newDuration, setNewDuration] = useState('60');

  const { data: exams } = useQuery({ queryKey: ['exams', 'all'], queryFn: async () => (await api.get('/exams', { params: { pageSize: 100 } })).data });
  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data, enabled: mode === 'new' });

  async function buildPaper() {
    if (selectedQuestions.length === 0) return toast.error('Select at least one question from the bank');
    if (!paperName.trim()) return toast.error('Enter a paper name');

    setSubmitting(true);
    try {
      let targetExamId = examId;
      if (mode === 'new') {
        if (!newTitle.trim() || !newBatchId || !newSubject.trim()) return toast.error('Fill in the new exam details');
        const res = await api.post('/exams', {
          title: newTitle,
          batchId: newBatchId,
          subject: newSubject,
          examDate: newExamDate || undefined,
          durationMinutes: newDuration ? Number(newDuration) : undefined,
        });
        targetExamId = res.data.id;
        const examDetail = await api.get(`/exams/${targetExamId}`);
        const autoPaper = examDetail.data.papers[0];
        if (autoPaper) await api.put(`/exams/papers/${autoPaper.id}`, { name: paperName });
        const paperId = autoPaper?.id;
        for (const q of selectedQuestions) await api.post(`/exams/papers/${paperId}/questions`, { questionId: q.id });
      } else {
        if (!targetExamId) return toast.error('Select an exam');
        const paperRes = await api.post(`/exams/${targetExamId}/papers`, { name: paperName });
        const paperId = paperRes.data.id;
        for (const q of selectedQuestions) await api.post(`/exams/papers/${paperId}/questions`, { questionId: q.id });
      }
      toast.success('Paper created');
      onDone(targetExamId);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card sticky top-4 space-y-3 p-4">
      <h2 className="text-sm font-semibold text-ink">Build a Paper</h2>

      <div className="flex gap-2 text-xs">
        <button className={`rounded-full px-3 py-1 ${mode === 'existing' ? 'bg-brand-600 text-ink' : 'bg-surface-muted text-ink-muted'}`} onClick={() => setMode('existing')}>Existing Exam</button>
        <button className={`rounded-full px-3 py-1 ${mode === 'new' ? 'bg-brand-600 text-ink' : 'bg-surface-muted text-ink-muted'}`} onClick={() => setMode('new')}>New Exam</button>
      </div>

      {mode === 'existing' ? (
        <label className="block">
          <span className="label">Exam</span>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select…</option>
            {exams?.items?.map((e: any) => <option key={e.id} value={e.id}>{e.title} ({e.batch.name})</option>)}
          </select>
        </label>
      ) : (
        <div className="space-y-2">
          <label className="block"><span className="label">Exam Title</span><input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></label>
          <label className="block">
            <span className="label">Batch</span>
            <select className="input" value={newBatchId} onChange={(e) => setNewBatchId(e.target.value)}>
              <option value="">Select…</option>
              {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Subject</span><input className="input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">Exam Date</span><input className="input" type="date" value={newExamDate} onChange={(e) => setNewExamDate(e.target.value)} /></label>
            <label className="block"><span className="label">Duration (min)</span><input className="input" type="number" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} /></label>
          </div>
        </div>
      )}

      <label className="block"><span className="label">Paper Name</span><input className="input" placeholder="e.g. Practical Paper" value={paperName} onChange={(e) => setPaperName(e.target.value)} /></label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Selected Questions ({selectedQuestions.length}, {totalSelectedMarks} marks)</span>
          {selectedQuestions.length > 0 && <button className="text-xs text-ink-muted hover:underline" onClick={onClear}>Clear</button>}
        </div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {selectedQuestions.length === 0 && <p className="text-xs text-ink-muted">Tick questions from the list to add them here.</p>}
          {selectedQuestions.map((q: any) => (
            <div key={q.id} className="flex items-center justify-between gap-2 rounded bg-surface-muted px-2 py-1 text-xs">
              <span className="line-clamp-1">{q.questionText}</span>
              <button className="text-red-600 dark:text-red-400 shrink-0" onClick={() => onRemove(q.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-primary w-full" onClick={buildPaper} disabled={submitting}>{submitting ? 'Creating…' : '+ Add Paper'}</button>
    </div>
  );
}
