import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
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
              <Link to="/people/courses" className="btn-secondary text-sm">Manage Courses</Link>
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
    </div>
  );
}
