import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';
import { StudentSearchPicker } from '@/components/StudentSearchPicker';

const RUBRIC_FIELDS = [
  ['contentScore', 'Content'],
  ['communicationScore', 'Communication'],
  ['confidenceScore', 'Confidence'],
  ['technicalScore', 'Technical'],
  ['qnaScore', 'Q&A'],
  ['timeManagementScore', 'Time Mgmt'],
] as const;

export default function PresentationsTab() {
  const { user } = useAuth();
  const isStaff = user && ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const queryClient = useQueryClient();
  const [batchFilter, setBatchFilter] = useState('');
  const [scoreTarget, setScoreTarget] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [studentLabel, setStudentLabel] = useState('');
  const [form, setForm] = useState({ studentId: '', topic: '', scheduledDate: '' });

  const { data: batches } = useQuery({
    queryKey: ['batches', 'active'],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 100, status: 'ACTIVE' } })).data,
    enabled: !!isStaff,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['presentations', batchFilter],
    queryFn: async () => (await api.get('/presentations', { params: { pageSize: 50, ...(batchFilter ? { batchId: batchFilter } : {}) } })).data,
  });
  const batchItems = (batches as { items?: any[] } | undefined)?.items ?? [];

  async function schedule() {
    if (!form.studentId) return toast.error('Select a student from the search results');
    if (!form.topic.trim() || !form.scheduledDate) return toast.error('Fill in topic and date');
    try {
      await api.post('/presentations', form);
      toast.success('Presentation scheduled');
      setScheduleOpen(false);
      setForm({ studentId: '', topic: '', scheduledDate: '' });
      setStudentLabel('');
      queryClient.invalidateQueries({ queryKey: ['presentations'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openScore(presentation: any) {
    setScoreTarget(presentation);
    setScores(Object.fromEntries(RUBRIC_FIELDS.map(([key]) => [key, presentation[key] != null ? String(presentation[key]) : ''])));
  }

  async function saveScore() {
    try {
      const payload = Object.fromEntries(RUBRIC_FIELDS.map(([key]) => [key, Number(scores[key] ?? 0)]));
      await api.patch(`/presentations/${scoreTarget.id}/score`, payload);
      toast.success('Score saved');
      setScoreTarget(null);
      setScores({});
      queryClient.invalidateQueries({ queryKey: ['presentations'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function batchLabel(r: any) {
    return r.batch?.name ?? r.student?.currentBatch?.name ?? '-';
  }

  function formatStudentWithBatch(r: any) {
    const name = `${r.student.firstName} ${r.student.lastName}`;
    const batch = batchLabel(r);
    return batch !== '-' ? `${name} · ${batch}` : name;
  }

  const columns = [
    { header: 'Student', cell: (r: any) => formatStudentWithBatch(r) },
    { header: 'Batch', cell: (r: any) => batchLabel(r) },
    { header: 'Topic', cell: (r: any) => r.topic },
    { header: 'Date', cell: (r: any) => new Date(r.scheduledDate).toDateString() },
    { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'CANCELLED' ? 'red' : 'blue'}>{r.status}</Badge> },
    { header: 'Score', cell: (r: any) => (r.totalScore != null ? `${r.totalScore}/60` : '-') },
    ...(isStaff
      ? [{ header: 'Actions', cell: (r: any) => (r.status !== 'CANCELLED' ? <button className="text-xs text-brand-ink hover:underline" onClick={() => openScore(r)}>{r.status === 'COMPLETED' ? 'Edit Score' : 'Score'}</button> : null) }]
      : []),
  ];

  return (
    <div>
      {isStaff && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <select className="input h-8 w-44 max-lg:w-full" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">All batches</option>
            {(batchItems).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setScheduleOpen(true)}>+ Schedule Presentation</button>
        </div>
      )}
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={columns}
      />

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule Presentation">
        <div className="space-y-3">
          <StudentSearchPicker
            studentId={form.studentId}
            selectedLabel={studentLabel}
            enabled={scheduleOpen}
            onSelect={(id, label) => { setForm((f) => ({ ...f, studentId: id })); setStudentLabel(label); }}
            onClear={() => { setForm((f) => ({ ...f, studentId: '' })); setStudentLabel(''); }}
          />
          <label className="block"><span className="label">Topic</span><input className="input" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} /></label>
          <label className="block"><span className="label">Date</span><input className="input" type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={schedule}>Schedule</button></div>
        </div>
      </Modal>

      <Modal open={!!scoreTarget} onClose={() => setScoreTarget(null)} title="Score Presentation" wide>
        {scoreTarget && (
          <div className="space-y-3">
            <div className="form-grid-3">
              {RUBRIC_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="label">{label} (0–10)</span>
                  <input className="input" type="number" min={0} max={10} value={scores[key] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div className="flex justify-end"><button className="btn-primary" onClick={saveScore}>Save Score</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
