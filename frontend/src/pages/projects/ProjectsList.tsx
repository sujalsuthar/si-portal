import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge, Spinner, EmptyState, TabBar } from '@/components/ui';

type ProjectKind = 'STUDENT' | 'INTERN';

export default function ProjectsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStudent = user?.role === 'STUDENT';
  const isFaculty = user?.role === 'FACULTY';
  const [kind, setKind] = useState<ProjectKind>(isFaculty ? 'INTERN' : 'STUDENT');
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

  useEffect(() => {
    setSelectedBatch(null);
  }, [kind]);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches', 'all', 'projects', kind],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 200, ...(kind === 'INTERN' ? { hasInterns: 'true' } : {}) } })).data,
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
            { header: 'Type', cell: (r: any) => <Badge tone={r.kind === 'INTERN' ? 'blue' : 'slate'}>{r.kind === 'INTERN' ? 'Intern' : 'Student'}</Badge> },
            { header: 'Deadline', cell: (r: any) => (r.deadline ? new Date(r.deadline).toLocaleDateString() : '-') },
          ]}
        />
      </div>
    );
  }

  const tabs = isFaculty ? ['Intern Projects'] : ['Student Projects', 'Intern Projects'];
  const activeTab = kind === 'INTERN' ? 'Intern Projects' : 'Student Projects';

  if (selectedBatch) {
    return <BatchProjectsList batch={selectedBatch} kind={kind} onBack={() => setSelectedBatch(null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={kind === 'INTERN' ? 'Intern projects by batch.' : 'Student projects by batch.'}
      />
      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={(tab) => setKind(tab === 'Intern Projects' ? 'INTERN' : 'STUDENT')}
      />
      <Table
        loading={isLoading}
        rows={batches?.items ?? []}
        keyFn={(r: any) => r.id}
        emptyText={kind === 'INTERN' ? 'No batches with interns found' : 'No batches found'}
        columns={[
          { header: 'Batch', cell: (r: any) => <button type="button" className="text-brand-ink hover:underline font-medium" onClick={() => setSelectedBatch({ id: r.id, name: r.name })}>{r.name}</button> },
          { header: 'Course', cell: (r: any) => r.course?.name ?? '-' },
          { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{r.status}</Badge> },
          { header: '', cell: (r: any) => <button type="button" className="text-xs text-brand-ink hover:underline" onClick={() => setSelectedBatch({ id: r.id, name: r.name })}>View Projects</button> },
        ]}
      />
    </div>
  );
}

function BatchProjectsList({
  batch,
  kind,
  onBack,
}: {
  batch: { id: string; name: string };
  kind: ProjectKind;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const facultyBlockedFromStudent = user?.role === 'FACULTY' && kind === 'STUDENT';
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', scope: '', groupSize: '4', deadline: '' });

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', 'batch', batch.id, kind],
    queryFn: async () => (await api.get('/projects', { params: { batchId: batch.id, kind } })).data,
  });

  async function create() {
    if (!form.name || !form.groupSize) return toast.error('Fill in all fields');
    try {
      const res = await api.post('/projects', {
        batchId: batch.id,
        name: form.name,
        scope: form.scope || undefined,
        groupSize: Number(form.groupSize),
        kind,
        ...(form.deadline ? { deadline: new Date(form.deadline).toISOString() } : {}),
      });
      toast.success('Project created');
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', 'batch', batch.id, kind] });
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const label = kind === 'INTERN' ? 'Intern Projects' : 'Student Projects';

  return (
    <div>
      <button type="button" className="mb-2 text-sm text-brand-ink hover:underline" onClick={onBack}>&larr; All Batches</button>
      <PageHeader
        title={`${label} — ${batch.name}`}
        subtitle="Projects, groups and grading for this batch."
        actions={canCreate && !facultyBlockedFromStudent && (
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>+ New Project</button>
        )}
      />
      <Table
        loading={isLoading}
        rows={projects ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Project', cell: (r: any) => <button type="button" className="text-brand-ink hover:underline font-medium" onClick={() => navigate(`/projects/${r.id}`)}>{r.name}</button> },
          { header: 'Groups', cell: (r: any) => r._count.groups },
          { header: 'Deadline', cell: (r: any) => (r.deadline ? new Date(r.deadline).toLocaleDateString() : '-') },
          { header: 'Grading', cell: (r: any) => (r.gradingOpen ? 'Open' : 'Closed') },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={`New ${kind === 'INTERN' ? 'Intern' : 'Student'} Project`}>
        <div className="space-y-3">
          <label className="block"><span className="label">Project Name</span><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label className="block"><span className="label">Scope</span><textarea className="input" rows={2} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} /></label>
          <label className="block"><span className="label">Group Size</span><input className="input" type="number" min={1} value={form.groupSize} onChange={(e) => setForm((f) => ({ ...f, groupSize: e.target.value }))} /></label>
          <label className="block"><span className="label">Deadline</span><input className="input" type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} /></label>
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={create}>Create</button></div>
        </div>
      </Modal>
    </div>
  );
}
