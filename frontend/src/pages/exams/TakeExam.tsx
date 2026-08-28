import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Spinner, Badge } from '@/components/ui';

export default function TakeExam() {
  const { id } = useParams();
  const [answers, setAnswers] = useState<Record<string, { selectedOption?: string; answerText?: string }>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const { data: exam, isLoading } = useQuery({ queryKey: ['exam', id], queryFn: async () => (await api.get(`/exams/${id}`)).data });

  if (isLoading || !exam) return <Spinner />;

  const questions = exam.papers.flatMap((p: any) => p.examQuestions.map((eq: any) => ({ ...eq, paperName: p.name })));

  async function submit() {
    const payload = Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a }));
    if (payload.length === 0) return toast.error('Answer at least one question');
    try {
      const res = await api.post(`/exams/${id}/answers`, { answers: payload });
      setResults(res.data);
      setSubmitted(true);
      toast.success('Answers submitted');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const resultByQuestion = new Map((results ?? []).map((r: any) => [r.questionId, r]));

  return (
    <div>
      <PageHeader title={exam.title} subtitle={`${exam.batch.name} · ${exam.subject} · Total Marks: ${exam.totalMarks}`} />
      <div className="space-y-4">
        {questions.map((eq: any, i: number) => {
          const q = eq.question;
          const result = resultByQuestion.get(q.id);
          return (
            <div key={eq.id} className="card p-4 text-sm">
              <p className="mb-2 font-medium text-ink">
                Q{i + 1}. {q.questionText} <span className="text-xs text-ink-muted">({eq.marks} marks · {eq.paperName})</span>
                {submitted && q.questionType === 'MCQ' && (
                  <Badge tone={result?.isCorrect ? 'green' : 'red'}>{result?.isCorrect ? 'Correct' : 'Incorrect'}</Badge>
                )}
              </p>
              {q.questionType === 'MCQ' ? (
                <div className="space-y-1.5">
                  {(q.options ?? []).map((opt: string) => (
                    <label key={opt} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={q.id}
                        disabled={submitted}
                        checked={answers[q.id]?.selectedOption === opt}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: { selectedOption: opt } }))}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="input"
                  rows={3}
                  disabled={submitted}
                  value={answers[q.id]?.answerText ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: { answerText: e.target.value } }))}
                />
              )}
            </div>
          );
        })}
        {questions.length === 0 && <p className="text-center text-sm text-ink-muted">No questions have been added to this exam yet.</p>}
      </div>
      {!submitted && questions.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={submit}>Submit Answers</button>
        </div>
      )}
      {submitted && (
        <p className="mt-4 text-sm text-ink-muted">
          Multiple-choice answers are marked automatically. Long-answer responses will be marked by staff against the rubric; your result appears once grades are published.
        </p>
      )}
    </div>
  );
}
