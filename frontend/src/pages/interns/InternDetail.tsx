import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Badge, Spinner, Modal, Table } from '@/components/ui';

export default function InternDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const canRate = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'].includes(user.role);
  const canDecideLeave = canRate;
  const isOwnIntern = user?.role === 'STUDENT' && user.profile?.id === id;

  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ behaviourScore: '70', technicalScore: '70', projectScore: '70', comment: '', mentorComment: '' });
  const [demoteOpen, setDemoteOpen] = useState(false);
  const [demoteReason, setDemoteReason] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [mentorId, setMentorId] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: '', points: '10' });
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [groupChoice, setGroupChoice] = useState('__new__');

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' });

  const { data: intern, isLoading } = useQuery({ queryKey: ['interns', id], queryFn: async () => (await api.get(`/interns/${id}`)).data });
  const { data: facultyList } = useQuery({ queryKey: ['faculty', 'all'], queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100 } })).data, enabled: reassignOpen });
  const { data: batchProjects } = useQuery({
    queryKey: ['projects', 'batch', intern?.currentBatchId],
    queryFn: async () => (await api.get('/projects', { params: { batchId: intern.currentBatchId } })).data,
    enabled: projectOpen && !!intern?.currentBatchId,
  });
  const { data: projectDetail } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });

  if (isLoading || !intern) return <Spinner />;

  async function submitRating() {
    try {
      await api.post(`/interns/${id}/ratings`, {
        behaviourScore: Number(rateForm.behaviourScore),
        technicalScore: Number(rateForm.technicalScore),
        projectScore: Number(rateForm.projectScore),
        comment: rateForm.comment || undefined,
        mentorComment: rateForm.mentorComment || undefined,
      });
      toast.success('Rating recorded');
      setRateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function demote() {
    if (!demoteReason) return toast.error('Enter a reason');
    try {
      await api.patch(`/interns/${id}/demote`, { reason: demoteReason });
      toast.success('Intern demoted');
      setDemoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function reassignMentor() {
    if (!mentorId) return toast.error('Select a mentor');
    try {
      await api.patch(`/interns/${id}/reassign-mentor`, { mentorId });
      toast.success('Mentor reassigned');
      setReassignOpen(false);
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function unfreeze() {
    try {
      await api.patch(`/interns/${id}/unfreeze`);
      toast.success('Work resumed');
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function assignTask() {
    if (!taskForm.title || !taskForm.dueDate) return toast.error('Enter a title and due date');
    try {
      await api.post('/tasks', { title: taskForm.title, dueDate: taskForm.dueDate, points: Number(taskForm.points), studentIds: [id] });
      toast.success('Task assigned');
      setTaskOpen(false);
      setTaskForm({ title: '', dueDate: '', points: '10' });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function assignToProject() {
    if (!projectId) return toast.error('Select a project');
    try {
      let targetGroupId = groupChoice;
      if (groupChoice === '__new__') {
        const res = await api.post(`/projects/${projectId}/groups`, {});
        targetGroupId = res.data.id;
      }
      await api.post(`/projects/${projectId}/groups/${targetGroupId}/members`, { studentId: id });
      toast.success('Added to project');
      setProjectOpen(false);
      setProjectId('');
      setGroupChoice('__new__');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function toggleActive() {
    try {
      await api.patch(`/students/${id}/status`, { status: intern.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      toast.success(intern.status === 'ACTIVE' ? 'Student deactivated' : 'Student reactivated');
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function decideLeave(requestId: string, action: 'approve' | 'reject') {
    try {
      await api.patch(`/interns/leave/requests/${requestId}/${action}`, {});
      toast.success(action === 'approve' ? 'Leave approved' : 'Leave rejected');
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function submitLeave() {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) return toast.error('Fill in dates and reason');
    try {
      await api.post(`/interns/${id}/leave`, leaveForm);
      toast.success('Leave request submitted');
      setLeaveOpen(false);
      setLeaveForm({ startDate: '', endDate: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['interns', id] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title={`${intern.firstName} ${intern.lastName}`}
        subtitle={`${intern.studentCode} · Task Mentor: ${intern.mentorFaculty ? `${intern.mentorFaculty.firstName} ${intern.mentorFaculty.lastName}` : 'Unassigned'}`}
        actions={
          <>
            <Badge tone={intern.internStatus === 'ACTIVE' ? 'green' : intern.internStatus === 'DEMOTED' ? 'red' : 'slate'}>{intern.internStatus}</Badge>
            <Badge tone={intern.status === 'ACTIVE' ? 'green' : 'slate'}>{intern.status === 'ACTIVE' ? 'Account Active' : 'Account Inactive'}</Badge>
            {canRate && intern.internStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setRateOpen(true)}>Rate Intern</button>}
            {canManage && intern.internStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setTaskOpen(true)}>Assign Task</button>}
            {canManage && intern.internStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setProjectOpen(true)}>Assign Project</button>}
            {canManage && intern.internStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setReassignOpen(true)}>Reassign Task Mentor</button>}
            {canManage && intern.internStatus === 'ACTIVE' && <button className="btn-danger" onClick={() => setDemoteOpen(true)}>Demote</button>}
            {canManage && <button className="btn-secondary" onClick={toggleActive}>{intern.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button>}
            {isOwnIntern && intern.internStatus === 'ACTIVE' && <button className="btn-secondary" onClick={() => setLeaveOpen(true)}>Request Leave</button>}
          </>
        }
      />

      {intern.internFrozen && (
        <div className="mb-5 card border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Work paused: {intern.internFrozenReason}</p>
          {canManage && <button className="btn-secondary mt-2" onClick={unfreeze}>Resume Work (Review Complete)</button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Ratings</h2>
          <Table
            rows={intern.internRatings ?? []}
            keyFn={(r: any) => r.id}
            columns={[
              { header: 'Date', cell: (r: any) => new Date(r.createdAt).toLocaleDateString() },
              { header: 'Behaviour', cell: (r: any) => r.behaviourScore },
              { header: 'Technical', cell: (r: any) => r.technicalScore },
              { header: 'Project', cell: (r: any) => r.projectScore },
            ]}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Mentor History</h2>
          <div className="card mb-5 divide-y divide-edge">
            {(intern.internMentorHistory ?? []).map((h: any) => (
              <div key={h.id} className="px-4 py-2 text-sm">
                {h.mentor.firstName} {h.mentor.lastName} - from {new Date(h.assignedAt).toLocaleDateString()} {h.endedAt ? `to ${new Date(h.endedAt).toLocaleDateString()}` : '(current)'}
              </div>
            ))}
          </div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Leave Requests</h2>
          <Table
            rows={intern.internLeaveRequests ?? []}
            keyFn={(r: any) => r.id}
            columns={[
              { header: 'Dates', cell: (r: any) => `${new Date(r.startDate).toLocaleDateString()} – ${new Date(r.endDate).toLocaleDateString()}` },
              { header: 'Reason', cell: (r: any) => r.reason },
              { header: 'Status', cell: (r: any) => <Badge tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>{r.status}</Badge> },
              ...(canDecideLeave
                ? [{
                    header: '',
                    cell: (r: any) =>
                      r.status === 'PENDING' ? (
                        <div className="flex gap-2 text-xs">
                          <button type="button" className="text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => decideLeave(r.id, 'approve')}>Approve</button>
                          <button type="button" className="text-red-600 dark:text-red-400 hover:underline" onClick={() => decideLeave(r.id, 'reject')}>Reject</button>
                        </div>
                      ) : null,
                  }]
                : []),
            ]}
          />
        </div>
      </div>

      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Rate Intern" wide>
        <div className="space-y-3">
          <div className="form-grid-3">
            <label className="block"><span className="label">Behaviour (0–100)</span><input className="input" type="number" value={rateForm.behaviourScore} onChange={(e) => setRateForm((f) => ({ ...f, behaviourScore: e.target.value }))} /></label>
            <label className="block"><span className="label">Technical (0–100)</span><input className="input" type="number" value={rateForm.technicalScore} onChange={(e) => setRateForm((f) => ({ ...f, technicalScore: e.target.value }))} /></label>
            <label className="block"><span className="label">Project (0–100)</span><input className="input" type="number" value={rateForm.projectScore} onChange={(e) => setRateForm((f) => ({ ...f, projectScore: e.target.value }))} /></label>
          </div>
          <label className="block"><span className="label">Internal comment (not shown to intern)</span><textarea className="input" rows={2} value={rateForm.comment} onChange={(e) => setRateForm((f) => ({ ...f, comment: e.target.value }))} /></label>
          <label className="block"><span className="label">Comment for the intern</span><textarea className="input" rows={2} value={rateForm.mentorComment} onChange={(e) => setRateForm((f) => ({ ...f, mentorComment: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={submitRating}>Save Rating</button></div>
        </div>
      </Modal>

      <Modal open={demoteOpen} onClose={() => setDemoteOpen(false)} title="Demote Intern">
        <div className="space-y-3">
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={3} value={demoteReason} onChange={(e) => setDemoteReason(e.target.value)} /></label>
          <div className="flex justify-end"><button className="btn-danger" onClick={demote}>Demote</button></div>
        </div>
      </Modal>

      <Modal open={reassignOpen} onClose={() => setReassignOpen(false)} title="Reassign Task Mentor">
        <div className="space-y-3">
          <label className="block">
            <span className="label">New Task Mentor</span>
            <select className="input" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
              <option value="">Select…</option>
              {facultyList?.items?.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
          </label>
          <div className="flex justify-end"><button className="btn-primary" onClick={reassignMentor}>Reassign</button></div>
        </div>
      </Modal>

      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="Assign Task">
        <div className="space-y-3">
          <label className="block"><span className="label">Title</span><input className="input" value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className="block"><span className="label">Due Date</span><input className="input" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} /></label>
          <label className="block"><span className="label">Points</span><input className="input" type="number" value={taskForm.points} onChange={(e) => setTaskForm((f) => ({ ...f, points: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={assignTask}>Assign</button></div>
        </div>
      </Modal>

      <Modal open={projectOpen} onClose={() => setProjectOpen(false)} title="Assign Project">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Project (from this intern's batch)</span>
            <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setGroupChoice('__new__'); }}>
              <option value="">Select…</option>
              {(batchProjects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {projectId && (
            <label className="block">
              <span className="label">Group</span>
              <select className="input" value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
                <option value="__new__">+ New Group</option>
                {(projectDetail?.groups ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.name ?? `Group ${g.sequence}`}</option>)}
              </select>
            </label>
          )}
          <div className="flex justify-end"><button className="btn-primary" onClick={assignToProject}>Add to Project</button></div>
        </div>
      </Modal>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Request Leave">
        <div className="space-y-3">
          <label className="block"><span className="label">Start Date</span><input className="input" type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label className="block"><span className="label">End Date</span><input className="input" type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label className="block"><span className="label">Reason</span><textarea className="input" rows={3} value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          <div className="flex justify-end"><button className="btn-primary" onClick={submitLeave}>Submit</button></div>
        </div>
      </Modal>
    </div>
  );
}
