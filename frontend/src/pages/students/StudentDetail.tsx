import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, StatCard, Badge, Spinner, EmptyState } from '@/components/ui';

const TYPE_TONE: Record<string, 'green' | 'red' | 'blue' | 'amber' | 'slate'> = {
  ATTENDANCE: 'blue',
  GRADE: 'green',
  TASK: 'amber',
  BEHAVIOUR: 'slate',
  PRESENTATION: 'blue',
  CERTIFICATION: 'green',
  CERTIFICATE: 'green',
  BATCH_TRANSFER: 'amber',
  SELF_ASSESSMENT: 'slate',
};

const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'gender',
  'phone',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'parentName',
  'parentMobile',
  'parentAltMobile',
] as const;

export default function StudentDetail() {
  const params = useParams();
  const studentId = (params.id ?? params.studentId)!;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const isParentViewer = user?.role === 'PARENT';
  const isStudentViewer = user?.role === 'STUDENT';
  const isFamilyViewer = isParentViewer || isStudentViewer;
  const canRecordConsent = user && !isFamilyViewer && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY', 'STUDENT'].includes(user.role);
  const parentProfile = isParentViewer ? (user?.profile as { firstName?: string; lastName?: string; phone?: string; altPhone?: string; permanentAddress?: string } | null) : null;

  const { data: student, isLoading: loadingStudent } = useQuery({
    queryKey: ['student', studentId],
    queryFn: async () => (await api.get(`/students/${studentId}`)).data,
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['student', studentId, 'timeline'],
    queryFn: async () => (await api.get(`/students/${studentId}/timeline`)).data,
  });

  const { data: gradeHistory } = useQuery({
    queryKey: ['grades', studentId, 'all'],
    queryFn: async () => (await api.get('/grades', { params: { studentId } })).data,
  });

  const { data: monthlyPerformance } = useQuery({
    queryKey: ['student', studentId, 'monthly-performance'],
    queryFn: async () => (await api.get(`/students/${studentId}/monthly-performance`)).data,
  });

  const { data: consents } = useQuery({
    queryKey: ['student', studentId, 'consent'],
    queryFn: async () => (await api.get(`/consent/${studentId}`)).data,
    enabled: !isFamilyViewer && !!canRecordConsent,
  });

  async function grantConsent(consentType: 'DATA_PROCESSING' | 'PARENTAL') {
    try {
      await api.post('/consent', { studentId, consentType, granted: true, noticeVersion: 'v1' });
      toast.success('Consent recorded');
      queryClient.invalidateQueries({ queryKey: ['student', studentId, 'consent'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function withdrawConsent(id: string) {
    try {
      await api.patch(`/consent/${id}/withdraw`);
      toast.success('Consent withdrawn');
      queryClient.invalidateQueries({ queryKey: ['student', studentId, 'consent'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  if (loadingStudent) return <Spinner />;
  if (!student) return <EmptyState text="Student not found" />;

  const composite = timeline?.composite;

  return (
    <div>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        subtitle={`${student.studentCode} · ${student.currentBatch?.name ?? 'No batch'}`}
        actions={!isFamilyViewer ? <Badge tone={student.status === 'ACTIVE' ? 'green' : 'slate'}>{student.status}</Badge> : undefined}
      />

      <div className="space-y-6">
        {isFamilyViewer ? (
          <>
            {isParentViewer && (
              <Section title="Parent Details">
                <div className="card p-4 text-sm">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Row label="Name" value={parentProfile ? `${parentProfile.firstName ?? ''} ${parentProfile.lastName ?? ''}`.trim() : '-'} />
                    <Row label="Mobile" value={parentProfile?.phone ?? '-'} />
                    <Row label="Alt. Mobile" value={parentProfile?.altPhone ?? '-'} />
                    <Row label="Permanent Address" value={parentProfile?.permanentAddress ?? '-'} />
                  </div>
                </div>
              </Section>
            )}

            <Section title="Student Details">
              <div className="card p-4 text-sm">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Row label="Name" value={`${student.firstName} ${student.lastName}`} />
                  <Row label="Student ID" value={student.studentCode} />
                  <Row label="Batch" value={student.currentBatch?.name ?? '-'} />
                  <Row label="Date of Birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toDateString() : '-'} />
                  <Row label="Gender" value={student.gender ?? '-'} />
                  <Row label="Phone" value={student.phone ?? '-'} />
                  <Row label="Current Address" value={student.address ?? '-'} />
                </div>
              </div>
            </Section>

            {!isParentViewer && (
              <Section title="Parent Details">
                {(student.parents ?? []).length === 0 ? (
                  <EmptyState text="No parent/guardian linked yet" />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {student.parents.map((p: any) => (
                      <div key={p.parent.id} className="card p-4 text-sm">
                        <p className="font-medium text-ink">{p.parent.firstName} {p.parent.lastName}</p>
                        <p className="text-ink-muted">{p.relationship ?? 'Guardian'}</p>
                        <p className="mt-1 text-ink-muted">{p.parent.user?.email}</p>
                        <p className="text-ink-muted">{p.parent.phone ?? '-'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <PerformanceOverviewSection
              composite={composite}
              gradeHistory={gradeHistory ?? []}
              monthlyPerformance={monthlyPerformance}
              interventionCases={timeline?.interventionCases}
              showInterventions={false}
            />

            <AcademicTimelineSection timeline={timeline?.timeline ?? []} loading={loadingTimeline} />
          </>
        ) : (
          <>
        <Section title="1. Student Details Info">
          <StudentDetailsForm student={student} studentId={studentId} canEdit={!!canEdit} />

          {canRecordConsent && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Consent &amp; Data Protection</h3>
              <div className="card space-y-2 p-4 text-sm">
                {(consents ?? []).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span>
                      {c.consentType.replace('_', ' ')} - <Badge tone={c.withdrawnAt ? 'red' : 'green'}>{c.withdrawnAt ? 'Withdrawn' : 'Granted'}</Badge>
                    </span>
                    {!c.withdrawnAt && (
                      <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => withdrawConsent(c.id)}>Withdraw</button>
                    )}
                  </div>
                ))}
                {(consents ?? []).length === 0 && <p className="text-ink-muted">No consent recorded yet.</p>}
                <div className="flex gap-2 pt-1">
                  <button className="btn-secondary text-xs" onClick={() => grantConsent('DATA_PROCESSING')}>Grant Data Processing</button>
                  <button className="btn-secondary text-xs" onClick={() => grantConsent('PARENTAL')}>Grant Parental Consent</button>
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section title="2. Parent Details">
          {(student.parents ?? []).length === 0 ? (
            <EmptyState text="No parent/guardian linked yet" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {student.parents.map((p: any) => (
                <div key={p.parent.id} className="card p-4 text-sm">
                  <p className="font-medium text-ink">{p.parent.firstName} {p.parent.lastName}</p>
                  <p className="text-ink-muted">{p.relationship ?? 'Guardian'}</p>
                  <p className="mt-1 text-ink-muted">{p.parent.user?.email}</p>
                  <p className="text-ink-muted">{p.parent.phone ?? '-'}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <PerformanceOverviewSection
          composite={composite}
          gradeHistory={gradeHistory ?? []}
          monthlyPerformance={monthlyPerformance}
          interventionCases={timeline?.interventionCases}
          showInterventions
        />

        <AcademicTimelineSection timeline={timeline?.timeline ?? []} loading={loadingTimeline} />
          </>
        )}
      </div>
    </div>
  );
}

function PerformanceOverviewSection({
  composite,
  gradeHistory,
  monthlyPerformance,
  interventionCases,
  showInterventions,
}: {
  composite: any;
  gradeHistory: any[];
  monthlyPerformance: any;
  interventionCases?: any[];
  showInterventions: boolean;
}) {
  return (
    <Section title="Performance Overview">
      {composite ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard label="Overall Score" value={`${composite.composite.toFixed(1)}%`} />
          <StatCard label="Attendance" value={`${composite.attendancePct.toFixed(0)}%`} />
          <StatCard label="Exams" value={`${composite.examPct.toFixed(0)}%`} />
          <StatCard label="Tasks" value={`${composite.taskPct.toFixed(0)}%`} />
          <StatCard label="Behaviour" value={`${composite.behaviourPct.toFixed(0)}%`} />
          <StatCard label="Presentations" value={`${composite.presentationPct.toFixed(0)}%`} />
          <StatCard label="Certifications" value={`${composite.certificationPct.toFixed(0)}%`} />
        </div>
      ) : (
        <EmptyState text="No performance data yet" />
      )}

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Exam Marks History</h3>
        <div className="card divide-y divide-edge">
          {gradeHistory.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No published exam marks yet</p>}
          {gradeHistory.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between px-4 py-2.5 text-sm max-lg:flex-col max-lg:items-start max-lg:gap-1">
              <span className="min-w-0 break-words text-ink">{g.exam?.title ?? '-'}</span>
              <span className="shrink-0 text-ink-muted">{g.exam?.examDate ? new Date(g.exam.examDate).toLocaleDateString() : '-'} · {g.marksObtained}/{g.exam?.totalMarks ?? '-'} ({g.percentage.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Monthly Performance ({monthlyPerformance?.year ?? new Date().getFullYear()})</h3>
        <div className="card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {(monthlyPerformance?.months ?? []).map((m: any) => (
            <div key={m.month} className="bg-surface p-2 text-center">
              <p className="text-[10px] uppercase text-ink-muted">{new Date(2000, m.month - 1, 1).toLocaleString(undefined, { month: 'short' })}</p>
              <p className="text-sm font-semibold text-ink">{m.avgPercentage != null ? `${m.avgPercentage}%` : '-'}</p>
            </div>
          ))}
        </div>
      </div>

      {showInterventions && (interventionCases?.length ?? 0) > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Active Support Cases</h3>
          <div className="card divide-y divide-edge">
            {interventionCases!.map((c: any) => (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge tone={c.severity === 'CRITICAL' || c.severity === 'HIGH' ? 'red' : 'amber'}>{c.severity}</Badge>
                  <span className="text-xs text-ink-muted">{c.status}</span>
                </div>
                <p className="mt-1 text-ink-muted">{c.triggerReason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function AcademicTimelineSection({ timeline, loading }: { timeline: any[]; loading: boolean }) {
  return (
    <Section title="Academic Timeline">
      {loading ? (
        <Spinner />
      ) : (
        <div className="card divide-y divide-edge">
          {timeline.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No activity recorded yet</p>}
          {timeline.map((e: any, i: number) => (
            <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <Badge tone={TYPE_TONE[e.type] ?? 'slate'}>{e.type.replace('_', ' ')}</Badge>
                <span className="text-ink">{e.summary}</span>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">{new Date(e.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function StudentDetailsForm({ student, studentId, canEdit }: { student: any; studentId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({
      firstName: student.firstName ?? '',
      lastName: student.lastName ?? '',
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : '',
      gender: student.gender ?? '',
      phone: student.phone ?? '',
      address: student.address ?? '',
      emergencyContactName: student.emergencyContactName ?? '',
      emergencyContactPhone: student.emergencyContactPhone ?? '',
      parentName: student.parentName ?? '',
      parentMobile: student.parentMobile ?? '',
      parentAltMobile: student.parentAltMobile ?? '',
    });
  }, [student]);

  async function save() {
    try {
      const payload: Record<string, string | undefined> = {};
      for (const key of EDITABLE_FIELDS) payload[key] = form[key] || undefined;
      await api.put(`/students/${studentId}`, payload);
      toast.success('Student details updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  if (!editing) {
    return (
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Overview</p>
          {canEdit && <button className="text-xs text-brand-ink hover:underline" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        <div className="grid gap-2.5 text-sm sm:grid-cols-2">
          <Row label="Name" value={`${student.firstName} ${student.lastName}`} />
          <Row label="Student ID" value={student.studentCode} />
          <Row label="Batch" value={student.currentBatch?.name ?? '-'} />
          <Row label="Date of Birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toDateString() : '-'} />
          <Row label="Gender" value={student.gender ?? '-'} />
          <Row label="Phone" value={student.phone ?? '-'} />
          <Row label="Address" value={student.address ?? '-'} />
          <Row label="Emergency Contact" value={student.emergencyContactName ? `${student.emergencyContactName} (${student.emergencyContactPhone ?? '-'})` : '-'} />
          <Row label="Parent Name" value={student.parentName ?? '-'} />
          <Row label="Parent Mobile" value={student.parentMobile ?? '-'} />
          <Row label="Parent Alt. Mobile" value={student.parentAltMobile ?? '-'} />
          <Row label="Joining Date" value={new Date(student.joiningDate).toDateString()} />
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="First Name"><input className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></F>
        <F label="Last Name"><input className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></F>
        <F label="Date of Birth"><input className="input" type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} /></F>
        <F label="Gender"><input className="input" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} /></F>
        <F label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></F>
        <F label="Address"><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></F>
        <F label="Emergency Contact Name"><input className="input" value={form.emergencyContactName} onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))} /></F>
        <F label="Emergency Contact Phone"><input className="input" value={form.emergencyContactPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))} /></F>
        <F label="Parent Name"><input className="input" value={form.parentName} onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))} /></F>
        <F label="Parent Mobile"><input className="input" value={form.parentMobile} onChange={(e) => setForm((f) => ({ ...f, parentMobile: e.target.value }))} /></F>
        <F label="Parent Alt. Mobile"><input className="input" value={form.parentAltMobile} onChange={(e) => setForm((f) => ({ ...f, parentAltMobile: e.target.value }))} /></F>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary text-sm" onClick={() => setEditing(false)}>Cancel</button>
        <button className="btn-primary text-sm" onClick={save}>Save</button>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
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
