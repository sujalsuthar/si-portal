import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Badge, Spinner, Modal } from '@/components/ui';

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const isAdmin = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const myStudentId = user?.role === 'STUDENT' ? user.profile?.id : undefined;
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [markGroupId, setMarkGroupId] = useState<string | null>(null);
  const [markId, setMarkId] = useState<string | null>(null);
  const [markForm, setMarkForm] = useState({ marksObtained: '', maxMarks: '100' });
  const [progressGroupId, setProgressGroupId] = useState<string | null>(null);
  const [progressForm, setProgressForm] = useState({ weekNumber: '1', note: '', link: '' });
  const [repoEdits, setRepoEdits] = useState<Record<string, string>>({});

  const { data: project, isLoading } = useQuery({ queryKey: ['project', id], queryFn: async () => (await api.get(`/projects/${id}`)).data });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, batchId: project?.batchId, pageSize: 10 } })).data,
    enabled: !!addMemberGroupId && studentSearch.length > 1,
  });

  if (isLoading || !project) return <Spinner />;

  const singleGroup = project.groups[0];

  function isMemberOf(g: any) {
    return myStudentId && g.members.some((m: any) => m.student.id === myStudentId);
  }

  async function addGroup() {
    try {
      await api.post(`/projects/${id}/groups`, {});
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removeGroup(groupId: string, force = false) {
    if (!confirm('Remove this group? This cannot be undone.')) return;
    try {
      await api.delete(`/projects/${id}/groups/${groupId}`, { params: force ? { force: 'true' } : {} });
      toast.success('Group removed');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err: any) {
      if (!force && err?.response?.status === 400) {
        if (confirm(`${apiErrorMessage(err)} Delete anyway (marks will be lost)?`)) return removeGroup(groupId, true);
        return;
      }
      toast.error(apiErrorMessage(err));
    }
  }

  async function setLeader(groupId: string, studentId?: string) {
    try {
      await api.post(`/projects/${id}/groups/${groupId}/leader`, { studentId });
      toast.success('Group leader updated');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function saveRepoLink(groupId: string) {
    const repoLink = repoEdits[groupId];
    if (repoLink === undefined) return;
    try {
      await api.patch(`/projects/${id}/groups/${groupId}`, { repoLink });
      toast.success('GitHub link updated');
      setRepoEdits((prev) => { const { [groupId]: _, ...rest } = prev; return rest; });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function addMember(studentId: string) {
    if (!addMemberGroupId) return;
    try {
      await api.post(`/projects/${id}/groups/${addMemberGroupId}/members`, { studentId });
      toast.success('Member added');
      setAddMemberGroupId(null);
      setStudentSearch('');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removeMember(groupId: string, studentId: string) {
    try {
      await api.delete(`/projects/${id}/groups/${groupId}/members/${studentId}`);
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function toggleGrading() {
    try {
      await api.patch(`/projects/${id}/grading-open`, { gradingOpen: !project.gradingOpen });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function openGrade(group: any) {
    setMarkGroupId(group.id);
    const existing = group.marks?.[0];
    setMarkId(existing?.id ?? null);
    setMarkForm({ marksObtained: existing ? String(existing.marksObtained) : '', maxMarks: existing ? String(existing.maxMarks) : '100' });
  }

  async function saveMark() {
    if (!markGroupId || !markForm.marksObtained) return;
    try {
      const payload = { marksObtained: Number(markForm.marksObtained), maxMarks: Number(markForm.maxMarks) };
      if (markId) await api.patch(`/projects/${id}/groups/${markGroupId}/marks/${markId}`, payload);
      else await api.post(`/projects/${id}/groups/${markGroupId}/marks`, payload);
      toast.success('Group mark recorded');
      setMarkGroupId(null);
      setMarkId(null);
      setMarkForm({ marksObtained: '', maxMarks: '100' });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function saveProgress() {
    if (!progressGroupId || !progressForm.note.trim()) return toast.error('Enter a progress note');
    try {
      await api.post(`/projects/${id}/groups/${progressGroupId}/progress`, {
        weekNumber: Number(progressForm.weekNumber),
        note: progressForm.note,
        link: progressForm.link || undefined,
      });
      toast.success('Weekly progress added');
      setProgressGroupId(null);
      setProgressForm({ weekNumber: '1', note: '', link: '' });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function renderGroupCard(g: any) {
    const canEditRepo = isStaff || isMemberOf(g);
    const groupCanAddMember = g.members.length < project.groupSize;
    return (
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Project Group ({g.members.length}/{project.groupSize} students)</h3>
          {g.marks.length > 0 && <Badge tone="green">{g.marks[0].marksObtained}/{g.marks[0].maxMarks}</Badge>}
        </div>

        <p className="mb-2 text-xs text-ink-muted">
          Leader: {g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : '-'}
          {isAdmin && g.members.length > 0 && (
            <button type="button" className="ml-2 text-brand-ink hover:underline" onClick={() => setLeader(g.id)}>Randomize</button>
          )}
        </p>

        <ul className="mb-2 space-y-1 text-sm">
          {g.members.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.student.firstName} {m.student.lastName}</span>
              <span className="flex items-center gap-2">
                {isAdmin && g.leaderId !== m.student.id && (
                  <button type="button" className="text-xs text-brand-ink hover:underline" onClick={() => setLeader(g.id, m.student.id)}>Make Leader</button>
                )}
                {isStaff && <button type="button" className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => removeMember(g.id, m.student.id)}>Remove</button>}
              </span>
            </li>
          ))}
          {g.members.length === 0 && <li className="text-ink-muted">No students added yet — add up to {project.groupSize} students from this batch.</li>}
        </ul>

        <div className="mb-2">
          <span className="label">GitHub Link (required)</span>
          {canEditRepo ? (
            <div className="flex gap-1">
              <input
                className="input h-8 text-xs"
                placeholder="https://github.com/…"
                value={repoEdits[g.id] ?? g.repoLink ?? ''}
                onChange={(e) => setRepoEdits((prev) => ({ ...prev, [g.id]: e.target.value }))}
              />
              <button type="button" className="btn-secondary shrink-0 px-2 text-xs" onClick={() => saveRepoLink(g.id)}>Save</button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">{g.repoLink || '-'}</p>
          )}
        </div>

        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Weekly Progress Reports</span>
            {(isStaff || isMemberOf(g)) && <button type="button" className="text-xs text-brand-ink hover:underline" onClick={() => setProgressGroupId(g.id)}>+ Add Update</button>}
          </div>
          {(g.progressUpdates ?? []).length === 0 ? (
            <p className="text-xs text-ink-muted">No weekly updates yet — students should log what they completed each week.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {g.progressUpdates.map((p: any) => (
                <li key={p.id} className="rounded bg-surface-muted px-2 py-1">
                  <span className="font-medium text-ink">Week {p.weekNumber}:</span> {p.note}
                  {p.link && <a className="ml-1 text-brand-ink hover:underline" href={p.link} target="_blank" rel="noreferrer">link</a>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {isStaff && (
          <div className="flex flex-wrap gap-2 text-xs">
            {groupCanAddMember && <button type="button" className="text-brand-ink hover:underline" onClick={() => setAddMemberGroupId(g.id)}>+ Add Student</button>}
            <button type="button" className="text-brand-ink hover:underline" onClick={() => openGrade(g)}>{g.marks.length > 0 ? 'Edit Grade' : 'Grade Group'}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={`${project.kind === 'INTERN' ? 'Intern' : 'Student'} Project · ${project.batch.name} · Group size: ${project.groupSize}${project.deadline ? ` · Deadline: ${new Date(project.deadline).toLocaleDateString()}` : ''}`}
        actions={
          isStaff && (
            <button className="btn-secondary" onClick={toggleGrading}>{project.gradingOpen ? 'Close Grading' : 'Reopen Grading'}</button>
          )
        }
      />
      {project.scope && <p className="mb-4 text-sm text-ink-muted">{project.scope}</p>}
      <p className="mb-4 text-xs text-ink-muted">Each batch project has one group of up to {project.groupSize} students. Add the GitHub repository link and weekly progress reports below.</p>

      {!singleGroup ? (
        <div className="card p-4">
          <p className="mb-3 text-sm text-ink-muted">No project group yet.</p>
          {isStaff && <button className="btn-primary" onClick={addGroup}>Create Group</button>}
        </div>
      ) : (
        <div className="max-w-3xl">
          {renderGroupCard(singleGroup)}
        </div>
      )}

      <Modal open={!!addMemberGroupId} onClose={() => setAddMemberGroupId(null)} title="Add Student">
        <input className="input mb-2" placeholder="Search student in this batch…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
        <div className="max-h-48 overflow-y-auto">
          {(studentResults?.items ?? []).map((s: any) => (
            <button key={s.id} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-surface-muted" onClick={() => addMember(s.id)}>{s.firstName} {s.lastName}</button>
          ))}
        </div>
      </Modal>

      <Modal open={!!markGroupId} onClose={() => { setMarkGroupId(null); setMarkId(null); }} title={markId ? 'Edit Grade' : 'Grade Group'}>
        <div className="space-y-3">
          <label className="block"><span className="label">Marks Obtained</span><input className="input" type="number" value={markForm.marksObtained} onChange={(e) => setMarkForm((f) => ({ ...f, marksObtained: e.target.value }))} /></label>
          <label className="block"><span className="label">Out of</span><input className="input" type="number" value={markForm.maxMarks} onChange={(e) => setMarkForm((f) => ({ ...f, maxMarks: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveMark}>Save</button></div>
        </div>
      </Modal>

      <Modal open={!!progressGroupId} onClose={() => setProgressGroupId(null)} title="Add Weekly Progress">
        <div className="space-y-3">
          <label className="block"><span className="label">Week Number</span><input className="input" type="number" min={1} value={progressForm.weekNumber} onChange={(e) => setProgressForm((f) => ({ ...f, weekNumber: e.target.value }))} /></label>
          <label className="block"><span className="label">Progress Note</span><textarea className="input" rows={3} value={progressForm.note} onChange={(e) => setProgressForm((f) => ({ ...f, note: e.target.value }))} /></label>
          <label className="block"><span className="label">Link (optional)</span><input className="input" value={progressForm.link} onChange={(e) => setProgressForm((f) => ({ ...f, link: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveProgress}>Save</button></div>
        </div>
      </Modal>
    </div>
  );
}
