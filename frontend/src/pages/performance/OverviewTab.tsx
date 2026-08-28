import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { StatCard, Spinner } from '@/components/ui';

/** Landing view for a student's own Performance page - a single-glance summary of every tab. */
export default function OverviewTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { user } = useAuth();
  const studentId = user?.profile?.id;

  const { data: behaviour, isLoading: loadingBehaviour } = useQuery({
    queryKey: ['behaviour', 'summary', studentId],
    queryFn: async () => (await api.get(`/behaviour/student/${studentId}/monthly-summary`)).data,
    enabled: !!studentId,
  });
  const { data: presentations, isLoading: loadingPresentations } = useQuery({
    queryKey: ['presentations', 'me'],
    queryFn: async () => (await api.get('/presentations', { params: { pageSize: 50 } })).data,
  });
  const { data: selfAssessments, isLoading: loadingSelfAssessments } = useQuery({
    queryKey: ['self-assessments', studentId],
    queryFn: async () => (await api.get(`/self-assessments/student/${studentId}`)).data,
    enabled: !!studentId,
  });
  const { data: marks, isLoading: loadingMarks } = useQuery({ queryKey: ['grades', 'me'], queryFn: async () => (await api.get('/grades')).data });

  if (loadingBehaviour || loadingPresentations || loadingSelfAssessments || loadingMarks) return <Spinner />;

  const pendingAssessments = (selfAssessments ?? []).filter((a: any) => a.approvalStatus === 'PENDING').length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <button className="text-left" onClick={() => onNavigate('Behaviour')}>
        <StatCard label="Behaviour - Net Points" value={behaviour?.totalNet ?? 0} tone={(behaviour?.totalNet ?? 0) >= 0 ? 'good' : 'bad'} />
      </button>
      <button className="text-left" onClick={() => onNavigate('Presentations')}>
        <StatCard label="Presentations" value={presentations?.items?.length ?? presentations?.pagination?.total ?? 0} />
      </button>
      <button className="text-left" onClick={() => onNavigate('Self-Assessment')}>
        <StatCard label="Self-Assessment Requests" value={selfAssessments?.length ?? 0} tone={pendingAssessments > 0 ? 'warn' : 'default'} />
      </button>
      <button className="text-left" onClick={() => onNavigate('Marks')}>
        <StatCard label="Published Exam Marks" value={marks?.length ?? 0} />
      </button>
    </div>
  );
}
