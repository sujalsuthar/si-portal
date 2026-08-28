import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader, Table, Badge } from '@/components/ui';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  status: string;
  course?: { name: string } | null;
  currentBatch?: { id: string; name: string } | null;
}

export default function StudentsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['students', search, batchId],
    queryFn: async () => (await api.get('/students', { params: { search, batchId: batchId || undefined, pageSize: 50 } })).data,
  });

  const { data: batches } = useQuery({ queryKey: ['batches', 'all'], queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data });

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Track every student's academic profile. New students are added via Batches → Add Students."
        actions={
          <>
            <input className="input w-56" placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input w-44" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches?.items?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        }
      />

      <Table<StudentRow>
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r) => r.id}
        columns={[
          { header: 'Student', cell: (r) => <button className="font-medium text-brand-ink hover:underline" onClick={() => navigate(`/people/students/${r.id}`)}>{r.firstName} {r.lastName}</button> },
          { header: 'Code', cell: (r) => r.studentCode },
          { header: 'Course', cell: (r) => r.course?.name ?? '-' },
          { header: 'Batch', cell: (r) => r.currentBatch?.name ?? '-' },
          { header: 'Status', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'green' : r.status === 'ARCHIVED' ? 'slate' : 'amber'}>{r.status}</Badge> },
        ]}
      />
    </div>
  );
}
