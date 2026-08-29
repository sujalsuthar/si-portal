import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

const DEFAULT_MARKS: Record<string, number> = { MCQ: 1, LONG_ANSWER: 10 };

type QuestionRow = { id: string; questionText: string; marks: number; questionType: string; usageCount?: number };

export default function QuestionBank() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, QuestionRow>>({});
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['questions', search], queryFn: async () => (await api.get('/questions', { params: { search, pageSize: 50 } })).data });
  const { register, handleSubmit, reset, watch, setValue } = useForm<Record<string, any>>({ defaultValues: { questionType: 'MCQ', marks: DEFAULT_MARKS.MCQ } });
  const questionType = watch('questionType');

  const questions: QuestionRow[] = data?.items ?? [];
  const selectedQuestions = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const totalSelectedMarks = selectedQuestions.reduce((s, q) => s + q.marks, 0);

  function toggleSelected(q: QuestionRow) {
    setSelectedMap((prev) => {
      if (prev[q.id]) {
        const next = { ...prev };
        delete next[q.id];
        return next;
      }
      return { ...prev, [q.id]: q };
    });
  }

  function onTypeChange(type: string) {
    setValue('questionType', type);
    setValue('marks', DEFAULT_MARKS[type] ?? 1);
    if (type === 'MCQ') {
      setMcqOptions(['', '', '', '']);
      setCorrectAnswer('');
    }
  }

  function updateOption(index: number, value: string) {
    setMcqOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  }

  function addOption() {
    setMcqOptions((prev) => [...prev, '']);
  }

  function removeOption(index: number) {
    setMcqOptions((prev) => {
      if (prev.length <= 2) return prev;
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (correctAnswer === removed) setCorrectAnswer('');
      return next;
    });
  }

  async function onCreate(values: any) {
    try {
      const options = questionType === 'MCQ' ? mcqOptions.map((o) => o.trim()).filter(Boolean) : undefined;
      if (questionType === 'MCQ') {
        if (!options || options.length < 2) return toast.error('Add at least 2 options');
        if (!correctAnswer.trim()) return toast.error('Select the correct answer');
        if (!options.includes(correctAnswer.trim())) return toast.error('Correct answer must match one option exactly');
      }
      const payload = {
        questionText: values.questionText,
        topic: values.topic || undefined,
        questionType: values.questionType,
        marks: Number(values.marks),
        options,
        correctAnswer: questionType === 'MCQ' ? correctAnswer.trim() : undefined,
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
      await api.post('/questions', payload);
      toast.success('Question added');
      setCreateOpen(false);
      reset({ questionType: 'MCQ', marks: DEFAULT_MARKS.MCQ });
      setMcqOptions(['', '', '', '']);
      setCorrectAnswer('');
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
            <input className="input w-56 max-lg:w-full" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Question</button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table
            loading={isLoading}
            rows={questions}
            keyFn={(r) => r.id}
            columns={[
              {
                header: '',
                cell: (r) => <input type="checkbox" checked={!!selectedMap[r.id]} onChange={() => toggleSelected(r)} />,
              },
              { header: 'Question', cell: (r) => <span className="line-clamp-2 max-w-md">{r.questionText}</span> },
              { header: 'Type', cell: (r) => <Badge tone={r.questionType === 'MCQ' ? 'blue' : 'slate'}>{r.questionType.replace('_', ' ')}</Badge> },
              { header: 'Marks', cell: (r) => r.marks },
              { header: 'Used', cell: (r) => r.usageCount ?? 0 },
            ]}
          />
        </div>

        <div>
          <BuildPaperPanel
            selectedQuestions={selectedQuestions}
            totalSelectedMarks={totalSelectedMarks}
            onRemove={(qid) => setSelectedMap((prev) => { const next = { ...prev }; delete next[qid]; return next; })}
            onClear={() => setSelectedMap({})}
            onDone={(examId) => {
              setSelectedMap({});
              queryClient.invalidateQueries({ queryKey: ['exams'] });
              navigate(`/exams/${examId}`);
            }}
          />
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Question" wide>
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Question Text</span><textarea className="input" rows={2} {...register('questionText', { required: true })} /></label>
          <div className="form-grid-3">
            <label className="block"><span className="label">Topic</span><input className="input" {...register('topic')} /></label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={questionType} onChange={(e) => onTypeChange(e.target.value)}>
                <option value="MCQ">Multiple Choice (auto-marked)</option>
                <option value="LONG_ANSWER">Long Answer (rubric-marked)</option>
              </select>
            </label>
            <label className="block"><span className="label">Marks</span>
              <select className="input" {...register('marks', { required: true })}>
                <option value={1}>1</option>
                <option value={10}>10</option>
              </select>
            </label>
          </div>
          {questionType === 'MCQ' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label mb-0">Options</span>
                <button type="button" className="text-xs text-brand-ink hover:underline" onClick={addOption}>+ Add option</button>
              </div>
              {mcqOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={opt}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => updateOption(i, e.target.value)}
                  />
                  {mcqOptions.length > 2 && (
                    <button type="button" className="text-xs text-red-600 dark:text-red-400" onClick={() => removeOption(i)}>Remove</button>
                  )}
                </div>
              ))}
              <label className="block">
                <span className="label">Correct Answer</span>
                <select className="input" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)}>
                  <option value="">Select correct option…</option>
                  {mcqOptions.map((o) => o.trim()).filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>
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
  selectedQuestions: QuestionRow[];
  totalSelectedMarks: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onDone: (examId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'library' | 'exam'>('library');
  const [examId, setExamId] = useState('');
  const [paperName, setPaperName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: libraryPapers, refetch: refetchLibrary } = useQuery({
    queryKey: ['paper-library'],
    queryFn: async () => (await api.get('/exams/papers/library')).data,
  });
  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ['exams', 'all'],
    queryFn: async () => (await api.get('/exams', { params: { pageSize: 100 } })).data,
    enabled: mode === 'exam',
  });

  const examItems = exams?.items ?? [];

  async function savePaper() {
    if (selectedQuestions.length === 0) return toast.error('Select at least one question from the bank');
    if (!paperName.trim()) return toast.error('Enter a paper name');

    setSubmitting(true);
    try {
      const questionIds = selectedQuestions.map((q) => q.id);
      if (mode === 'library') {
        await api.post('/exams/papers/library', { name: paperName, questionIds });
        toast.success('Paper saved to library');
        setPaperName('');
        onClear();
        refetchLibrary();
        queryClient.invalidateQueries({ queryKey: ['paper-library'] });
      } else {
        if (!examId) return toast.error('Select an exam');
        const paperRes = await api.post(`/exams/${examId}/papers`, { name: paperName });
        const paperId = paperRes.data.id;
        for (const qid of questionIds) await api.post(`/exams/papers/${paperId}/questions`, { questionId: qid });
        toast.success('Paper attached to exam');
        onDone(examId);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card sticky top-4 space-y-3 p-4 max-lg:static">
      <h2 className="text-sm font-semibold text-ink">Paper Creation</h2>
      <p className="text-xs text-ink-muted">Save reusable papers here anytime. When scheduling an exam, attach a saved paper from the exam detail page.</p>

      <div className="flex gap-2 text-xs">
        <button type="button" className={`rounded-full px-3 py-1 ${mode === 'library' ? 'bg-brand-600 text-ink' : 'bg-surface-muted text-ink-muted'}`} onClick={() => setMode('library')}>Save to Library</button>
        <button type="button" className={`rounded-full px-3 py-1 ${mode === 'exam' ? 'bg-brand-600 text-ink' : 'bg-surface-muted text-ink-muted'}`} onClick={() => setMode('exam')}>Attach to Exam</button>
      </div>

      {mode === 'exam' && (
        <label className="block">
          <span className="label">Exam</span>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">{examsLoading ? 'Loading exams…' : 'Select…'}</option>
            {examItems.map((e: any) => (
              <option key={e.id} value={e.id}>{e.title} ({e.batch?.name ?? 'No batch'})</option>
            ))}
          </select>
          {!examsLoading && examItems.length === 0 && (
            <p className="mt-1 text-xs text-ink-muted">No exams available. Create an exam first, then attach a paper.</p>
          )}
        </label>
      )}

      <label className="block"><span className="label">Paper Name</span><input className="input" placeholder="e.g. Practical Paper" value={paperName} onChange={(e) => setPaperName(e.target.value)} /></label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Selected Questions ({selectedQuestions.length}, {totalSelectedMarks} marks)</span>
          {selectedQuestions.length > 0 && <button type="button" className="text-xs text-ink-muted hover:underline" onClick={onClear}>Clear</button>}
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {selectedQuestions.length === 0 && <p className="text-xs text-ink-muted">Tick questions from the list to add them here.</p>}
          {selectedQuestions.map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-2 rounded bg-surface-muted px-2 py-1 text-xs">
              <span className="line-clamp-1">{q.questionText}</span>
              <button type="button" className="text-red-600 dark:text-red-400 shrink-0" onClick={() => onRemove(q.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="btn-primary w-full" onClick={savePaper} disabled={submitting}>
        {submitting ? 'Saving…' : mode === 'library' ? '+ Save Paper' : '+ Add Paper to Exam'}
      </button>

      <div>
        <span className="label">Saved Papers ({libraryPapers?.length ?? 0})</span>
        <div className="mt-1 max-h-36 space-y-1 overflow-y-auto">
          {(libraryPapers ?? []).length === 0 && <p className="text-xs text-ink-muted">No saved papers yet.</p>}
          {(libraryPapers ?? []).map((p: any) => (
            <div key={p.id} className="rounded bg-surface-muted px-2 py-1.5 text-xs">
              <p className="font-medium text-ink">{p.name}</p>
              <p className="text-ink-muted">{p._count?.examQuestions ?? 0} questions · {p.totalMarks} marks</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
