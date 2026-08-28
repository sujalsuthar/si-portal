import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  RECOMMENDED: 'slate',
  IN_PREPARATION: 'blue',
  SCHEDULED: 'amber',
  PASSED: 'green',
  FAILED: 'red',
  EXPIRED: 'slate',
};
const STATUSES = Object.keys(STATUS_TONE);

export default function CertificationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'STUDENT';
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');

  const { data: items, isLoading } = useQuery({ queryKey: ['certifications'], queryFn: async () => (await api.get('/certifications').then((r) => r.data)) });

  async function addCertification() {
    if (!name) return toast.error('Enter a certification name');
    try {
      await api.post('/certifications', { name, provider, studentId: user?.profile?.id });
      toast.success('Certification added');
      setCreateOpen(false);
      setName('');
      setProvider('');
      queryClient.invalidateQueries({ queryKey: ['certifications'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/certifications/${id}`, { status });
      queryClient.invalidateQueries({ queryKey: ['certifications'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      {isStudent && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Add Certification</button>
        </div>
      )}
      <Table
        loading={isLoading}
        rows={items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          { header: 'Certification', cell: (r: any) => r.name },
          { header: 'Provider', cell: (r: any) => r.provider ?? '-' },
          {
            header: 'Status',
            cell: (r: any) => (
              <select className="input py-1 text-xs" value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            ),
          },
        ]}
      />
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Certification">
        <div className="space-y-3">
          <label className="block"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className="label">Provider</span><input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={addCertification}>Add</button></div>
        </div>
      </Modal>
    </div>
  );
}
