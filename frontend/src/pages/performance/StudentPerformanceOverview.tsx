import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { StatCard, Spinner, Badge, Table } from '@/components/ui';
import SelfAssessmentTab from '@/pages/development/SelfAssessmentTab';
import { SelfBehaviourView } from '@/pages/performance/BehaviourTab';
import PresentationsTab from '@/pages/performance/PresentationsTab';

type Section = 'behaviour' | 'presentations' | 'self-assessment' | 'marks' | null;

export default function StudentPerformanceOverview() {
  const { user } = useAuth();
  const studentId = user?.profile?.id;
  const [expanded, setExpanded] = useState<Section>(null);

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
  const { data: examRoster, isLoading: loadingMarks } = useQuery({
    queryKey: ['grades', 'exam-roster'],
    queryFn: async () => (await api.get('/grades/me/exam-roster')).data,
  });

  if (loadingBehaviour || loadingPresentations || loadingSelfAssessments || loadingMarks) return <Spinner />;

  const pendingAssessments = (selfAssessments ?? []).filter((a: any) => a.approvalStatus === 'PENDING').length;
  const presentationCount = presentations?.items?.length ?? presentations?.pagination?.total ?? 0;
  const givenCount = (examRoster ?? []).filter((r: any) => r.status === 'Given').length;

  function toggle(section: Section) {
    setExpanded((current) => (current === section ? null : section));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" className="text-left" onClick={() => toggle('behaviour')}>
          <StatCard
            label="Behaviour — Net Points"
            value={behaviour?.totalNet ?? 0}
            tone={(behaviour?.totalNet ?? 0) >= 0 ? 'good' : 'bad'}
          />
        </button>
        <button type="button" className="text-left" onClick={() => toggle('presentations')}>
          <StatCard label="Presentations" value={presentationCount} />
        </button>
        <button type="button" className="text-left" onClick={() => toggle('self-assessment')}>
          <StatCard
            label="Self-Assessment Requests"
            value={selfAssessments?.length ?? 0}
            tone={pendingAssessments > 0 ? 'warn' : 'default'}
          />
        </button>
        <button type="button" className="text-left" onClick={() => toggle('marks')}>
          <StatCard label="Exams (Given)" value={`${givenCount}/${examRoster?.length ?? 0}`} />
        </button>
      </div>

      {expanded === 'behaviour' && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Behaviour</h3>
          <SelfBehaviourView studentId={studentId} />
        </div>
      )}
      {expanded === 'presentations' && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Presentations</h3>
          <PresentationsTab />
        </div>
      )}
      {expanded === 'self-assessment' && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Self-Assessment</h3>
          <SelfAssessmentTab hideCompareCards />
        </div>
      )}
      {expanded === 'marks' && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Marks History</h3>
          <Table
            rows={examRoster ?? []}
            keyFn={(r: any) => r.examId}
            emptyText="No exams scheduled for your batch yet"
            columns={[
              { header: 'Exam Name', cell: (r: any) => r.examName },
              { header: 'Date', cell: (r: any) => (r.examDate ? new Date(r.examDate).toLocaleDateString() : '-') },
              {
                header: 'Status',
                cell: (r: any) => (
                  <Badge tone={r.status === 'Given' ? 'green' : 'slate'}>{r.status}</Badge>
                ),
              },
              {
                header: 'Marks',
                cell: (r: any) =>
                  r.marksObtained != null
                    ? `${r.marksObtained}/${r.totalMarks}${r.percentage != null ? ` (${r.percentage.toFixed(1)}%)` : ''}`
                    : '-',
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
