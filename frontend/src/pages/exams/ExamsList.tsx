import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge } from '@/components/ui';

export default function ExamsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const canReview = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const showMarkSheetLink = canCreate || canReview;

  const { data, isLoading } = useQuery({ queryKey: ['exams'], queryFn: async () => (await api.get('/exams', { params: { pageSize: 50 } })).data });
  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data, enabled: createOpen });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      const payload = {
        title: values.title,
        batchId: values.batchId,
        subject: values.subject,
        examDate: values.examDate ? values.examDate : undefined,
        durationMinutes: values.durationMinutes === '' || values.durationMinutes == null ? undefined : Number(values.durationMinutes),
      };
      const res = await api.post('/exams', payload);
      toast.success('Exam created');
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      navigate(`/exams/${res.data.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Create exams, build question papers and publish grades."
        actions={
          <>
            <Link to="/exams/questions" className="btn-secondary">Question Bank</Link>
            {canCreate && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Create Exam</button>}
          </>
        }
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Title', cell: (r: any) => <Link className="font-medium text-brand-ink hover:underline" to={user?.role === 'STUDENT' ? `/exams/${r.id}/take` : `/exams/${r.id}`}>{r.title}</Link> },
          { header: 'Batch', cell: (r: any) => r.batch.name },
          { header: 'Subject', cell: (r: any) => r.subject },
          { header: 'Total Marks', cell: (r: any) => r.totalMarks },
          { header: 'Papers', cell: (r: any) => r._count.papers },
          {
            header: 'Status',
            cell: (r: any) => (
              <Badge tone={r.status === 'PUBLISHED' ? 'green' : r.status === 'REJECTED' ? 'red' : r.status === 'GRADED' ? 'amber' : r.status === 'DRAFT' ? 'slate' : 'blue'}>{r.status}</Badge>
            ),
          },
          ...(showMarkSheetLink
            ? [{ header: '', cell: (r: any) => <Link className="text-xs text-brand-ink hover:underline" to={`/exams/${r.id}/marksheet`}>Mark Sheet</Link> }]
            : []),
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Exam">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">Title</span><input className="input" {...register('title', { required: true })} /></label>
          <label className="block">
            <span className="label">Batch</span>
            <select className="input" {...register('batchId', { required: true })}>
              <option value="">Select…</option>
              {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Subject</span><input className="input" {...register('subject', { required: true })} /></label>
          <label className="block"><span className="label">Exam Date</span><input className="input" type="date" {...register('examDate')} /></label>
          <label className="block"><span className="label">Duration (minutes)</span><input className="input" type="number" {...register('durationMinutes')} /></label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
