import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Badge, Spinner } from '@/components/ui';

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  NOT_STARTED: 'slate',
  IN_PROGRESS: 'blue',
  SUBMITTED: 'blue',
  LATE: 'red',
  EVALUATED: 'green',
};

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isFaculty = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const [submissionText, setSubmissionText] = useState('');
  const [evaluating, setEvaluating] = useState<Record<string, { points: string; feedback: string }>>({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});

  const { data: task, isLoading } = useQuery({ queryKey: ['task', id], queryFn: async () => (await api.get(`/tasks/${id}`)).data });

  if (isLoading || !task) return <Spinner />;

  const mySubmission = task.submissions.find((s: any) => s.studentId === user?.profile?.id);

  async function submitMine() {
    try {
      const form = new FormData();
      if (submissionText) form.append('submissionText', submissionText);
      await api.post(`/tasks/${id}/submit`, form);
      toast.success('Submitted');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function evaluate(submissionId: string) {
    const draft = evaluating[submissionId];
    if (!draft?.points) return toast.error('Enter points to award');
    try {
      await api.patch(`/tasks/submissions/${submissionId}/evaluate`, { pointsAwarded: Number(draft.points), feedback: draft.feedback });
      toast.success('Evaluated');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title={task.title} subtitle={`${task.batch?.name ?? ''} · Due ${new Date(task.dueDate).toDateString()} · ${task.points} points`} />

      <div className="card mb-5 p-4 text-sm text-ink">
        {task.description && <p className="mb-2">{task.description}</p>}
        {task.instructions && <p className="text-ink-muted">{task.instructions}</p>}
      </div>

      {user?.role === 'STUDENT' && mySubmission && (
        <div className="card mb-5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Your Submission</h2>
          <Badge tone={STATUS_TONE[mySubmission.status]}>{mySubmission.status}</Badge>
          {mySubmission.status === 'NOT_STARTED' || mySubmission.status === 'IN_PROGRESS' ? (
            <div className="mt-3 space-y-2">
              <textarea className="input" rows={3} placeholder="Add notes or a link to your work…" value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} />
              <button className="btn-primary" onClick={submitMine}>Submit Task</button>
            </div>
          ) : (
            <div className="mt-3 text-sm text-ink-muted">
              {mySubmission.pointsAwarded != null && <p>Score: {mySubmission.pointsAwarded} / {task.points}</p>}
              {mySubmission.feedback && <p className="mt-1 text-ink-muted">Feedback: {mySubmission.feedback}</p>}
            </div>
          )}
        </div>
      )}

      {isFaculty && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-ink">Submissions</h2>
          <Table
            rows={task.submissions}
            keyFn={(r: any) => r.id}
            columns={[
              { header: 'Student', cell: (r: any) => `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}` },
              { header: 'Status', cell: (r: any) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
              {
                header: 'Evaluate',
                cell: (r: any) => {
                  const isEvaluated = r.status === 'EVALUATED';
                  const showForm = r.status === 'SUBMITTED' || r.status === 'LATE' || (isEvaluated && editingIds[r.id]);
                  if (showForm) {
                    return (
                      <div className="flex items-center gap-2">
                        <input
                          className="input w-20"
                          type="number"
                          placeholder="Pts"
                          value={evaluating[r.id]?.points ?? (isEvaluated ? String(r.pointsAwarded ?? '') : '')}
                          onChange={(e) => setEvaluating((prev) => ({ ...prev, [r.id]: { ...prev[r.id], points: e.target.value } }))}
                        />
                        <input
                          className="input w-40"
                          placeholder="Feedback"
                          value={evaluating[r.id]?.feedback ?? (isEvaluated ? r.feedback ?? '' : '')}
                          onChange={(e) => setEvaluating((prev) => ({ ...prev, [r.id]: { ...prev[r.id], feedback: e.target.value } }))}
                        />
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            evaluate(r.id);
                            setEditingIds((prev) => ({ ...prev, [r.id]: false }));
                          }}
                        >
                          Save
                        </button>
                      </div>
                    );
                  }
                  return isEvaluated ? (
                    <div className="flex items-center gap-2">
                      <span>{r.pointsAwarded} pts</span>
                      <button className="text-xs text-brand-ink hover:underline" onClick={() => setEditingIds((prev) => ({ ...prev, [r.id]: true }))}>Edit</button>
                    </div>
                  ) : (
                    '-'
                  );
                },
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
