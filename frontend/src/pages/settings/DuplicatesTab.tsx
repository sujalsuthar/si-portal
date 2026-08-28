import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Table, EmptyState } from '@/components/ui';

export default function DuplicatesTab() {
  const { data, isLoading } = useQuery({ queryKey: ['settings', 'duplicates'], queryFn: async () => (await api.get('/settings/duplicates')).data });

  if (isLoading) return null;

  const groups: { title: string; rows: any[] }[] = [
    { title: 'Students sharing a phone number', rows: data?.studentsSharingPhone ?? [] },
    { title: 'Team members sharing a phone number', rows: data?.facultySharingPhone ?? [] },
    { title: 'Parents sharing a phone number', rows: data?.parentsSharingPhone ?? [] },
    { title: 'Students sharing name and date of birth', rows: data?.studentsSharingNameAndDob ?? [] },
  ];

  const anyFound = groups.some((g) => g.rows.length > 0);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        Hard duplicates on email and enrolment code are already prevented at the database level. This scans for softer
        cases - the same contact number or the same name and date of birth on more than one record - for review.
      </p>
      {!anyFound && <EmptyState text="No potential duplicates found." />}
      {groups.map(
        (g) =>
          g.rows.length > 0 && (
            <div key={g.title} className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-ink">{g.title}</h3>
              {g.rows.map((group: any[], i: number) => (
                <Table
                  key={i}
                  rows={group}
                  keyFn={(r: any) => r.id}
                  columns={[
                    { header: 'Name', cell: (r: any) => `${r.firstName} ${r.lastName}` },
                    { header: 'Code', cell: (r: any) => r.studentCode ?? r.employeeCode ?? '-' },
                    { header: 'Phone', cell: (r: any) => r.phone ?? '-' },
                  ]}
                />
              ))}
            </div>
          ),
      )}
    </div>
  );
}
