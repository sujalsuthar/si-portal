import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Table, Spinner } from '@/components/ui';

/** Replaces the removed Certifications tab - a simple table of published exam marks. */
export default function MarksTab() {
  const { data, isLoading } = useQuery({ queryKey: ['grades', 'me'], queryFn: async () => (await api.get('/grades')).data });

  if (isLoading) return <Spinner />;

  return (
    <Table
      loading={isLoading}
      rows={data ?? []}
      keyFn={(r: any) => r.id}
      emptyText="No published marks yet"
      columns={[
        { header: 'Exam Name', cell: (r: any) => r.exam?.title ?? '-' },
        { header: 'Date', cell: (r: any) => (r.exam?.examDate ? new Date(r.exam.examDate).toLocaleDateString() : '-') },
        { header: 'Marks', cell: (r: any) => `${r.marksObtained} / ${r.exam?.totalMarks ?? '-'} (${r.percentage.toFixed(1)}%)` },
      ]}
    />
  );
}
