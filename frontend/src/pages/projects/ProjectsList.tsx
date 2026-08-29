import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge, Spinner, EmptyState } from '@/components/ui';

// Batch -> that batch's Projects -> Group (existing multi-group capability on ProjectDetail is
// untouched; this only changes how you get there - per the 4.1 request's navigation flow).
export default function ProjectsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStudent = user?.role === 'STUDENT';
  const [selectedBatch, setSelectedBatch] = useState<{ id: string; name: string } | null>(null);

  const { data: studentProjects, isLoading: loadingStudentProjects } = useQuery({
    queryKey: ['projects', 'mine'],
    queryFn: async () => (await api.get('/projects')).data,
    enabled: isStudent,
  });

  useEffect(() => {
    if (isStudent && studentProjects?.length === 1) {
      navigate(`/projects/${studentProjects[0].id}`, { replace: true });
    }
  }, [isStudent, studentProjects, navigate]);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches', 'all'],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 200 } })).data,
    enabled: !isStudent,
  });

  if (isStudent) {
    if (loadingStudentProjects) return <Spinner />;
    if ((studentProjects ?? []).length === 0) {
      return (
        <div>
          <PageHeader title="Projects" subtitle="Your batch project." />
          <EmptyState text="No project assigned to your batch yet." />
        </div>
      );
    }
    if (studentProjects.length === 1) return <Spinner />;
    return (
      <div>
        <PageHeader title="Projects" subtitle="Your batch projects." />
        <Table
          rows={studentProjects}
          keyFn={(r: any) => r.id}
          columns={[
            { header: 'Project', cell: (r: any) => <button type="button" className="text-brand-ink hover:underline font-medium" onClick={() => navigate(`/projects/${r.id}`)}>{r.name}</button> },
            { header: 'Batch', cell: (r: any) => r.batch?.name ?? '-' },
            { header: 'Deadline', cell: (r: any) => (r.deadline ? new Date(r.deadline).toLocaleDateString() : '-') },
          ]}
        />
      </div>
    );
  }

  if (selectedBatch) {
    return <BatchProjectsList batch={selectedBatch} onBack={() => setSelectedBatch(null)} />;
  }

  return (
    <div>
      <PageHeader title="Intern Projects" subtitle="Select a batch to view and manage its projects." />
      <Table
        loading={isLoading}
        rows={batches?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Batch', cell: (r: any) => <button className="text-brand-ink hover:underline font-medium" onClick={() => setSelectedBatch({ id: r.id, name: r.name })}>{r.name}</button> },
          { header: 'Course', cell: (r: any) => r.course?.name ?? '-' },
          { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge> },
          { header: '', cell: (r: any) => <button className="text-xs text-brand-ink hover:underline" onClick={() => setSelectedBatch({ id: r.id, name: r.name })}>View Projects</button> },
        ]}
      />
    </div>
  );
}

function BatchProjectsList({ batch, onBack }: { batch: { id: string; name: string }; onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', scope: '', groupSize: '4', deadline: '' });

  const { data: projects, isLoading } = useQuery({ queryKey: ['projects', 'batch', batch.id], queryFn: async () => (await api.get('/projects', { params: { batchId: batch.id } })).data });

  async function create() {
    if (!form.name || !form.groupSize) return toast.error('Fill in all fields');
    try {
      const res = await api.post('/projects', {
        batchId: batch.id,
        name: form.name,
        scope: form.scope || undefined,
        groupSize: Number(form.groupSize),
        ...(form.deadline ? { deadline: new Date(form.deadline).toISOString() } : {}),
      });
      toast.success('Project created');
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', 'batch', batch.id] });
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <button className="mb-2 text-sm text-brand-ink hover:underline" onClick={onBack}>&larr; All Batches</button>
      <PageHeader
        title={`Intern Projects - ${batch.name}`}
        subtitle="Projects, groups and grading for this batch."
        actions={canCreate && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ New Project</button>}
      />
      <Table
        loading={isLoading}
        rows={projects ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Project', cell: (r: any) => <button className="text-brand-ink hover:underline font-medium" onClick={() => navigate(`/projects/${r.id}`)}>{r.name}</button> },
          { header: 'Groups', cell: (r: any) => r._count.groups },
          { header: 'Grading', cell: (r: any) => (r.gradingOpen ? 'Open' : 'Closed') },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Project">
        <div className="space-y-3">
          <label className="block"><span className="label">Project Name</span><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label className="block"><span className="label">Scope</span><textarea className="input" rows={2} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} /></label>
          <label className="block"><span className="label">Group Size</span><input className="input" type="number" min={1} value={form.groupSize} onChange={(e) => setForm((f) => ({ ...f, groupSize: e.target.value }))} /></label>
          <label className="block"><span className="label">Deadline</span><input className="input" type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={create}>Create</button></div>
        </div>
      </Modal>
    </div>
  );
}
