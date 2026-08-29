import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Table, Modal, Badge, Spinner } from '@/components/ui';

export default function ParentsList() {
  const [search, setSearch] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['parents', search],
    queryFn: async () => (await api.get('/parents', { params: { search, pageSize: 50 } })).data,
  });

  return (
    <div>
      <PageHeader
        title="Parents & Guardians"
        subtitle="View parent accounts and their linked students."
        actions={
          <input className="input w-56 max-lg:w-full" placeholder="Search by parent or student name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        }
      />
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Name', cell: (r: any) => <button className="font-medium text-brand-ink hover:underline" onClick={() => setViewingId(r.id)}>{r.firstName} {r.lastName}</button> },
          { header: 'Username (Email)', cell: (r: any) => r.user.email },
          { header: 'Linked Students', cell: (r: any) => r.students.length ? r.students.map((s: any) => <Badge key={s.student.id}>{s.student.firstName} {s.student.lastName}</Badge>) : '-' },
          { header: 'Main Mobile', cell: (r: any) => r.phone ?? '-' },
        ]}
      />

      <Modal open={!!viewingId} onClose={() => setViewingId(null)} title="Parent Details" wide>
        {viewingId && <ParentDetailView parentId={viewingId} />}
      </Modal>
    </div>
  );
}

const PARENT_EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'altPhone', 'contactEmail', 'currentAddress', 'permanentAddress', 'occupation'] as const;

function ParentDetailView({ parentId }: { parentId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [batchFilters, setBatchFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ['parent', parentId], queryFn: async () => (await api.get(`/parents/${parentId}`)).data });
  if (isLoading || !data) return <Spinner />;

  function startEdit() {
    setForm(Object.fromEntries(PARENT_EDITABLE_FIELDS.map((f) => [f, data[f] ?? ''])));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/parents/${parentId}`, form);
      toast.success('Parent details updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['parent', parentId] });
      queryClient.invalidateQueries({ queryKey: ['parents'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Login Details</h3>
        <div className="form-grid text-sm">
          <Row label="Name" value={`${data.firstName} ${data.lastName}`} />
          <Row label="ID" value={data.id} />
          <Row label="Username (Email)" value={data.user.email} />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Parent Information</h3>
          {canEdit && !editing && <button className="text-xs text-brand-ink hover:underline" onClick={startEdit}>Edit</button>}
        </div>
        {editing ? (
          <div className="form-grid text-sm">
            <label className="block"><span className="label">First Name</span><input className="input" value={form.firstName} onChange={(e) => setForm((f: any) => ({ ...f, firstName: e.target.value }))} /></label>
            <label className="block"><span className="label">Last Name</span><input className="input" value={form.lastName} onChange={(e) => setForm((f: any) => ({ ...f, lastName: e.target.value }))} /></label>
            <label className="block"><span className="label">Contact Email</span><input className="input" value={form.contactEmail} onChange={(e) => setForm((f: any) => ({ ...f, contactEmail: e.target.value }))} /></label>
            <label className="block"><span className="label">Main Mobile</span><input className="input" value={form.phone} onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></label>
            <label className="block"><span className="label">Alternative Mobile</span><input className="input" value={form.altPhone} onChange={(e) => setForm((f: any) => ({ ...f, altPhone: e.target.value }))} /></label>
            <label className="block"><span className="label">Occupation</span><input className="input" value={form.occupation} onChange={(e) => setForm((f: any) => ({ ...f, occupation: e.target.value }))} /></label>
            <label className="block col-span-2"><span className="label">Current Address</span><input className="input" value={form.currentAddress} onChange={(e) => setForm((f: any) => ({ ...f, currentAddress: e.target.value }))} /></label>
            <label className="block col-span-2"><span className="label">Permanent Address</span><input className="input" value={form.permanentAddress} onChange={(e) => setForm((f: any) => ({ ...f, permanentAddress: e.target.value }))} /></label>
            <div className="col-span-2 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <div className="form-grid text-sm">
            <Row label="Contact Email" value={data.contactEmail ?? '-'} />
            <Row label="Main Mobile" value={data.phone ?? '-'} />
            <Row label="Alternative Mobile" value={data.altPhone ?? '-'} />
            <Row label="Occupation" value={data.occupation ?? '-'} />
            <Row label="Current Address" value={data.currentAddress ?? '-'} />
            <Row label="Permanent Address" value={data.permanentAddress ?? '-'} />
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Student / Child Information &amp; Performance</h3>
        {(data.childrenPerformance ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No linked students</p>
        ) : (
          <div className="space-y-3">
            {data.childrenPerformance.map((c: any) => {
              const batches = [...new Map((c.examHistory ?? []).map((e: any) => [e.batchId, e.batchName])).entries()] as [string, string][];
              const batchFilter = batchFilters[c.studentId] ?? '';
              const exams = (c.examHistory ?? []).filter((e: any) => !batchFilter || e.batchId === batchFilter);
              return (
              <div key={c.studentId} className="card p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{c.studentName}</p>
                  <Badge>{c.composite.composite.toFixed(1)}% composite</Badge>
                </div>
                {batches.length > 0 && (
                  <select
                    className="input mb-2 h-8 w-full max-w-xs text-xs"
                    value={batchFilter}
                    onChange={(e) => setBatchFilters((prev) => ({ ...prev, [c.studentId]: e.target.value }))}
                  >
                    <option value="">All batches</option>
                    {batches.map(([batchId, batchName]) => (
                      <option key={batchId} value={batchId}>{batchName}</option>
                    ))}
                  </select>
                )}
                {exams.length === 0 ? (
                  <p className="text-xs text-ink-muted">No published exam marks for this batch yet</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-ink-muted">
                        <th className="py-1">Exam</th>
                        <th className="py-1">Batch</th>
                        <th className="py-1">Date</th>
                        <th className="py-1">Marks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {exams.map((e: any, i: number) => (
                        <tr key={i}>
                          <td className="py-1 text-ink">{e.examTitle}</td>
                          <td className="py-1 text-ink-muted">{e.batchName}</td>
                          <td className="py-1 text-ink-muted">{new Date(e.examDate).toLocaleDateString()}</td>
                          <td className="py-1 text-ink-muted">{e.marksObtained} ({e.percentage.toFixed(1)}%)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );})}
          </div>
        )}
      </div>
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
