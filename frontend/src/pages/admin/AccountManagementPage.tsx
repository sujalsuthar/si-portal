import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Table, Badge, TabBar } from '@/components/ui';
import { roleLabel } from '@/lib/roleLabels';
import { RoleName } from '@/types';

const MANAGEABLE_ROLES: RoleName[] = ['STUDENT', 'FACULTY', 'ACADEMIC_ADMIN', 'PARENT'];

function displayName(row: any) {
  const profile = row.student ?? row.faculty ?? row.parent;
  if (profile) return `${profile.firstName} ${profile.lastName}`;
  return '-';
}

export default function AccountManagementPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState('All');

  const roleFilter = roleTab === 'Students' ? 'STUDENT' : roleTab === 'Parents' ? 'PARENT' : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', search, roleFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { search, pageSize: 100 };
      if (roleFilter) params.role = roleFilter;
      const res = await api.get('/users', { params });
      return {
        ...res.data,
        items: res.data.items.filter((u: any) => MANAGEABLE_ROLES.includes(u.role) && u.role !== 'SUPER_ADMIN'),
      };
    },
  });

  const tabs = ['All', 'Students', 'Team Members', 'Parents'];

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/users/${id}/${isActive ? 'deactivate' : 'activate'}`);
      toast.success(isActive ? 'Account deactivated' : 'Account activated');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const filteredItems = (data?.items ?? []).filter((row: any) => {
    if (roleTab === 'Team Members') return row.role === 'FACULTY' || row.role === 'ACADEMIC_ADMIN';
    if (roleTab === 'Students') return row.role === 'STUDENT';
    if (roleTab === 'Parents') return row.role === 'PARENT';
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Account Management"
        subtitle="Deactivate or reactivate student, parent, and team member accounts."
      />
      <TabBar tabs={tabs} active={roleTab} onChange={setRoleTab} />
      <div className="filter-row mb-3 mt-3">
        <input
          className="input w-72 max-lg:w-full"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Table
        loading={isLoading}
        rows={filteredItems}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Name', cell: (r: any) => displayName(r) },
          { header: 'Email', cell: (r: any) => r.email },
          { header: 'Role', cell: (r: any) => <Badge>{roleLabel(r.role)}</Badge> },
          { header: 'Status', cell: (r: any) => <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            header: 'Actions',
            cell: (r: any) => (
              <button className="text-xs text-brand-ink hover:underline" onClick={() => toggleActive(r.id, r.isActive)}>
                {r.isActive ? 'Deactivate' : 'Activate'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}
