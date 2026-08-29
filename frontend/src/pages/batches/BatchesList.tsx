import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

export default function BatchesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const canManage = user && user.role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery({ queryKey: ['batches'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data });
  const { data: courses } = useQuery({ queryKey: ['courses', 'all'], queryFn: async () => (await api.get('/courses', { params: { pageSize: 100 } })).data });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      await api.post('/batches', { ...values, capacity: values.capacity ? Number(values.capacity) : undefined });
      toast.success('Batch created');
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Batches"
        subtitle="Cohorts, timetables and faculty assignments."
        actions={
          canManage && (
            <>
              <button type="button" className="btn-secondary text-sm" onClick={() => setCoursesOpen(true)}>Manage Courses</button>
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Batch</button>
            </>
          )
        }
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Batch', cell: (r: any) => <button className="font-medium text-brand-ink hover:underline" onClick={() => navigate(`/batches/${r.id}`)}>{r.name}</button> },
          { header: 'Course', cell: (r: any) => r.course.name },
          { header: 'Strength', cell: (r: any) => `${r._count.students}${r.capacity ? ` / ${r.capacity}` : ''}` },
          { header: 'Start Date', cell: (r: any) => new Date(r.startDate).toDateString() },
          { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge> },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Batch">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Name</span><input className="input" {...register('name', { required: true })} /></label>
          <label className="block"><span className="label">Code</span><input className="input" {...register('code', { required: true })} /></label>
          <label className="block">
            <span className="label">Course</span>
            <select className="input" {...register('courseId', { required: true })}>
              <option value="">Select…</option>
              {courses?.items?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Start Date</span><input className="input" type="date" {...register('startDate', { required: true })} /></label>
          <label className="block"><span className="label">Capacity</span><input className="input" type="number" {...register('capacity')} /></label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      <ManageCoursesModal open={coursesOpen} onClose={() => setCoursesOpen(false)} onChanged={() => queryClient.invalidateQueries({ queryKey: ['courses'] })} />
    </div>
  );
}

function ManageCoursesModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => (await api.get('/courses', { params: { pageSize: 100 } })).data,
    enabled: open,
  });
  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      await api.post('/courses', { ...values, durationWeeks: values.durationWeeks ? Number(values.durationWeeks) : undefined });
      toast.success('Course created');
      setCreateOpen(false);
      reset();
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Courses" wide>
      <p className="mb-3 text-sm text-ink-muted">Programs offered — each batch belongs to a course.</p>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Course</button>
      </div>
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Name', cell: (r: any) => r.name },
          { header: 'Code', cell: (r: any) => r.code },
          { header: 'Duration', cell: (r: any) => (r.durationWeeks ? `${r.durationWeeks} weeks` : '-') },
          { header: 'Batches', cell: (r: any) => r._count.batches },
          { header: 'Students', cell: (r: any) => r._count.students },
          { header: 'Status', cell: (r: any) => <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'Active' : 'Archived'}</Badge> },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Course">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Name</span><input className="input" {...register('name', { required: true })} /></label>
          <label className="block"><span className="label">Code</span><input className="input" {...register('code', { required: true })} /></label>
          <label className="block"><span className="label">Duration (weeks)</span><input className="input" type="number" {...register('durationWeeks')} /></label>
          <label className="block"><span className="label">Description</span><textarea className="input" rows={3} {...register('description')} /></label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>
    </Modal>
  );
}
