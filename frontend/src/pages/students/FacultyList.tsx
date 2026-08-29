import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge, Spinner } from '@/components/ui';

export default function FacultyList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const canManage = user && user.role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['faculty', search],
    queryFn: async () => (await api.get('/faculty', { params: { search, pageSize: 50 } })).data,
  });

  const { register, handleSubmit, reset } = useForm();

  async function onCreate(values: any) {
    try {
      const res = await api.post('/faculty', values);
      toast.success(`Faculty account created. Temp password: ${res.data.tempPassword}`, { duration: 8000 });
      setCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['faculty'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Instructor and mentor profiles and their mentored students."
        actions={<input className="input w-56 max-lg:w-full" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />}
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          {
            header: 'Name',
            cell: (r: any) =>
              canManage ? (
                <button className="font-medium text-brand-ink hover:underline" onClick={() => setViewingId(r.id)}>
                  {r.firstName} {r.lastName}
                </button>
              ) : (
                `${r.firstName} ${r.lastName}`
              ),
          },
          { header: 'Employee Code', cell: (r: any) => r.employeeCode },
          { header: 'Email', cell: (r: any) => r.user.email },
          { header: 'Department', cell: (r: any) => r.department ?? '-' },
          { header: 'Status', cell: (r: any) => <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Team Member">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
          <label className="block"><span className="label">First Name</span><input className="input" {...register('firstName', { required: true })} /></label>
          <label className="block"><span className="label">Last Name</span><input className="input" {...register('lastName', { required: true })} /></label>
          <label className="block"><span className="label">Email</span><input className="input" type="email" {...register('email', { required: true })} /></label>
          <label className="block"><span className="label">Employee Code</span><input className="input" {...register('employeeCode', { required: true })} /></label>
          <label className="block"><span className="label">Department</span><input className="input" {...register('department')} /></label>
          <label className="block"><span className="label">Designation</span><input className="input" {...register('designation')} /></label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      {canManage && (
        <Modal open={!!viewingId} onClose={() => setViewingId(null)} title="Team Member Details" wide>
          {viewingId && <FacultyDetailView facultyId={viewingId} />}
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function FacultyDetailView({ facultyId }: { facultyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['faculty', facultyId],
    queryFn: async () => (await api.get(`/faculty/${facultyId}`)).data,
  });
  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Login Details</h3>
        <div className="form-grid text-sm">
          <Row label="Name" value={`${data.firstName} ${data.lastName}`} />
          <Row label="Employee Code" value={data.employeeCode} />
          <Row label="Username (Email)" value={data.user.email} />
          <Row label="Last Login" value={data.user.lastLoginAt ? new Date(data.user.lastLoginAt).toLocaleString() : '-'} />
          <Row label="Status" value={data.user.isActive ? 'Active' : 'Inactive'} />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Team Member Information</h3>
        <div className="form-grid text-sm">
          <Row label="Phone" value={data.phone ?? '-'} />
          <Row label="Department" value={data.department ?? '-'} />
          <Row label="Designation" value={data.designation ?? '-'} />
          <Row label="Joining Date" value={data.joiningDate ? new Date(data.joiningDate).toLocaleDateString() : '-'} />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Students Under This Team Member</h3>
        {data.mentoredStudents.length === 0 ? (
          <p className="text-sm text-ink-muted">No mentored students</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.mentoredStudents.map((s: any) => (
              <Badge key={s.id}>{s.firstName} {s.lastName} ({s.studentCode})</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
