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
  const [batchFilter, setBatchFilter] = useState('');
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const isStudent = user?.role === 'STUDENT';
  const isParent = user?.role === 'PARENT';

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', batchFilter],
    queryFn: async () => (await api.get('/tasks', { params: { pageSize: 50, ...(batchFilter ? { batchId: batchFilter } : {}) } })).data,
  });
  const { data: batches } = useQuery({
    queryKey: ['batches', 'active'],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 100, status: 'ACTIVE' } })).data,
    enabled: createOpen || !isStudent,
  });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      await api.post('/tasks', {
        ...values,
        points: Number(values.points || 0),
        gracePeriodHours: values.gracePeriodHours ? Number(values.gracePeriodHours) : undefined,
        lateDeductionRate: values.lateDeductionRate ? Number(values.lateDeductionRate) : 0,
      });
      toast.success('Task assigned');
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const activeBatches = batches?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Tasks & Assignments"
        subtitle={isStudent ? 'Track and submit your assigned tasks.' : 'Assign tasks, review submissions, and evaluate.'}
        actions={canCreate && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Assign Task</button>}
      />
      {!isStudent && !isParent && (
        <div className="mb-3">
          <label className="inline-flex w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center">
            <span className="text-ink-muted">Filter by batch</span>
            <select className="input w-full sm:w-48" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All batches</option>
              {activeBatches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Task', cell: (r: any) => <Link className="font-medium text-brand-ink hover:underline" to={`/tasks/${r.id}`}>{r.title}</Link> },
          ...(!isStudent && !isParent ? [{ header: 'Batch', cell: (r: any) => r.batch?.name ?? '-' }] : []),
          { header: 'Due Date', cell: (r: any) => new Date(r.dueDate).toDateString() },
          { header: 'Points', cell: (r: any) => r.points },
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
          <div className="form-grid-3">
            <label className="block">
              <span className="label">Batch</span>
              <select className="input" {...register('batchId', { required: true })}>
                <option value="">Select active batch…</option>
                {activeBatches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Due Date</span><input className="input" type="date" {...register('dueDate', { required: true })} /></label>
            <label className="block"><span className="label">Points</span><input className="input" type="number" defaultValue={10} {...register('points')} /></label>
          </div>
          <p className="text-xs text-ink-muted">The task will be assigned to all active students in the selected batch.</p>
          <div className="form-grid">
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
