import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

export default function CoursesList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = user && user.role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => (await api.get('/courses', { params: { pageSize: 100 } })).data,
  });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      await api.post('/courses', { ...values, durationWeeks: values.durationWeeks ? Number(values.durationWeeks) : undefined });
      toast.success('Course created');
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="Programs offered - each batch belongs to a course."
        actions={canManage && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Course</button>}
      />
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
    </div>
  );
}
