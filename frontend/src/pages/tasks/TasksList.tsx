import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  NOT_STARTED: 'slate',
  IN_PROGRESS: 'blue',
  SUBMITTED: 'blue',
  LATE: 'red',
  EVALUATED: 'green',
};

export default function TasksList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const isStudent = user?.role === 'STUDENT';
  const isParent = user?.role === 'PARENT';
  const [assignMode, setAssignMode] = useState<'BATCH' | 'INTERNS'>('BATCH');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedInternIds, setSelectedInternIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({ queryKey: ['tasks'], queryFn: async () => (await api.get('/tasks', { params: { pageSize: 50 } })).data });
  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data, enabled: createOpen });
  const { data: batchInterns } = useQuery({
    queryKey: ['students', 'interns', selectedBatchId],
    queryFn: async () => (await api.get('/students', { params: { batchId: selectedBatchId, studentType: 'INTERN', pageSize: 100 } })).data,
    enabled: createOpen && assignMode === 'INTERNS' && !!selectedBatchId,
  });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    if (assignMode === 'INTERNS' && selectedInternIds.length === 0) return toast.error('Select at least one intern');
    try {
      await api.post('/tasks', {
        ...values,
        points: Number(values.points || 0),
        gracePeriodHours: values.gracePeriodHours ? Number(values.gracePeriodHours) : undefined,
        lateDeductionRate: values.lateDeductionRate ? Number(values.lateDeductionRate) : 0,
        ...(assignMode === 'INTERNS' ? { studentIds: selectedInternIds } : {}),
      });
      toast.success('Task assigned');
      setCreateOpen(false);
      reset();
      setAssignMode('BATCH');
      setSelectedBatchId('');
      setSelectedInternIds([]);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks & Assignments"
        subtitle={isStudent ? 'Track and submit your assigned tasks.' : 'Assign tasks, review submissions, and evaluate.'}
        actions={canCreate && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Assign Task</button>}
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Task', cell: (r: any) => <Link className="font-medium text-brand-ink hover:underline" to={`/tasks/${r.id}`}>{r.title}</Link> },
          // Spec: Student/Parent task tables omit the Batch column entirely.
          ...(!isStudent && !isParent ? [{ header: 'Batch', cell: (r: any) => r.batch?.name ?? '-' }] : []),
          { header: 'Due Date', cell: (r: any) => new Date(r.dueDate).toDateString() },
          { header: 'Points', cell: (r: any) => r.points },
          // Spec: Student/Parent tables show a Status column (Completed/Not Submitted/Late) instead of Submissions.
          ...(isStudent || isParent
            ? [{ header: 'Status', cell: (r: any) => <Badge tone={r.status === 'Completed' ? 'green' : r.status === 'Late' ? 'red' : 'slate'}>{r.status}</Badge> }]
            : [{ header: 'Submissions', cell: (r: any) => `${r._count.submissions}/${r._count.assignments}` }]),
          ...(canCreate ? [{ header: '', cell: (r: any) => <button className="btn-secondary" onClick={() => setEditTask(r)}>Edit</button> }] : []),
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Assign Task" wide>
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Title</span><input className="input" {...register('title', { required: true })} /></label>
          <label className="block"><span className="label">Description</span><textarea className="input" rows={2} {...register('description')} /></label>
          <label className="block"><span className="label">Instructions</span><textarea className="input" rows={2} {...register('instructions')} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Batch</span>
              <select
                className="input"
                {...register('batchId', { required: true })}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                <option value="">Select…</option>
                {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Due Date</span><input className="input" type="date" {...register('dueDate', { required: true })} /></label>
            <label className="block"><span className="label">Points</span><input className="input" type="number" defaultValue={10} {...register('points')} /></label>
          </div>
          <label className="block">
            <span className="label">Assign To</span>
            <select className="input" value={assignMode} onChange={(e) => { setAssignMode(e.target.value as 'BATCH' | 'INTERNS'); setSelectedInternIds([]); }}>
              <option value="BATCH">Whole Batch</option>
              <option value="INTERNS">Interns Only</option>
            </select>
          </label>
          {assignMode === 'INTERNS' && (
            <div>
              <span className="label">Select Interns</span>
              {!selectedBatchId ? (
                <p className="text-xs text-ink-muted">Select a batch first</p>
              ) : !batchInterns?.items?.length ? (
                <p className="text-xs text-ink-muted">No interns in this batch</p>
              ) : (
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-edge p-2">
                  {batchInterns.items.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedInternIds.includes(s.id)}
                        onChange={(e) =>
                          setSelectedInternIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id)))
                        }
                      />
                      {s.firstName} {s.lastName} ({s.studentCode})
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Grace Period (hours)</span>
              <input className="input" type="number" min={0} placeholder="0" {...register('gracePeriodHours')} />
            </label>
            <label className="block">
              <span className="label">Late Deduction (per day, 0–1)</span>
              <input className="input" type="number" step={0.05} min={0} max={1} placeholder="0" {...register('lateDeductionRate')} />
            </label>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Assign</button>
          </div>
        </form>
      </Modal>

      {editTask && (
        <EditTaskModal
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            setEditTask(null);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
    </div>
  );
}

function EditTaskModal({ task, onClose, onSaved }: { task: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title: task.title,
      dueDate: new Date(task.dueDate).toISOString().slice(0, 10),
      points: task.points,
    },
  });

  async function onSubmit(values: any) {
    try {
      await api.put(`/tasks/${task.id}`, { ...values, points: Number(values.points) });
      toast.success('Task updated');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Task">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <label className="block"><span className="label">Title</span><input className="input" {...register('title', { required: true })} /></label>
        <label className="block"><span className="label">Due Date</span><input className="input" type="date" {...register('dueDate', { required: true })} /></label>
        <label className="block"><span className="label">Points</span><input className="input" type="number" {...register('points')} /></label>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
}
