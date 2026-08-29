import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Table, Badge, Modal } from '@/components/ui';
import { roleLabel } from '@/lib/roleLabels';

type AddUserRole = 'ACADEMIC_ADMIN' | 'FACULTY' | 'STUDENT' | 'PARENT';

type AddUserFormValues = {
  role: AddUserRole;
  email: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  studentCode?: string;
  currentBatchId?: string;
  courseId?: string;
  consentGranted?: boolean;
  phone?: string;
  altPhone?: string;
  contactEmail?: string;
  currentAddress?: string;
  permanentAddress?: string;
  occupation?: string;
};

export default function UsersTab() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'SUPER_ADMIN';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['users', search], queryFn: async () => (await api.get('/users', { params: { search, pageSize: 50 } })).data });

  const addUserForm = useForm<AddUserFormValues>({
    defaultValues: { role: 'ACADEMIC_ADMIN', consentGranted: false },
  });
  const selectedRole = addUserForm.watch('role');
  const selectedBatchId = addUserForm.watch('currentBatchId');

  const { data: batches } = useQuery({
    queryKey: ['batches', 'all'],
    queryFn: async () => (await api.get('/batches', { params: { pageSize: 100 } })).data,
    enabled: addUserOpen && selectedRole === 'STUDENT',
  });

  function openAddUser() {
    addUserForm.reset({ role: 'ACADEMIC_ADMIN', consentGranted: false });
    setAddUserOpen(true);
  }

  function closeAddUser() {
    setAddUserOpen(false);
    addUserForm.reset({ role: 'ACADEMIC_ADMIN', consentGranted: false });
  }

  function onBatchChange(batchId: string) {
    addUserForm.setValue('currentBatchId', batchId);
    const batch = batches?.items?.find((b: any) => b.id === batchId);
    if (batch?.course?.id) addUserForm.setValue('courseId', batch.course.id);
    else if (!batchId) addUserForm.setValue('courseId', '');
  }

  async function onCreateUser(values: AddUserFormValues) {
    try {
      if (values.role === 'ACADEMIC_ADMIN') {
        const res = await api.post('/users/admins', { email: values.email });
        toast.success(`Admin account created. Temp password: ${res.data.tempPassword}`, { duration: 8000 });
      } else if (values.role === 'FACULTY') {
        const res = await api.post('/faculty', {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          employeeCode: values.employeeCode,
          department: values.department,
          designation: values.designation,
        });
        toast.success(`Team account created. Temp password: ${res.data.tempPassword}`, { duration: 8000 });
        queryClient.invalidateQueries({ queryKey: ['faculty'] });
      } else if (values.role === 'STUDENT') {
        if (!values.consentGranted) return toast.error('Data processing consent is required to enrol a student');
        const res = await api.post('/students', {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          studentCode: values.studentCode,
          courseId: values.courseId || undefined,
          currentBatchId: values.currentBatchId || undefined,
          dataProcessingConsent: { granted: true, noticeVersion: 'v1' },
        });
        toast.success(`Student account created. Temp password: ${res.data.tempPassword}`, { duration: 8000 });
        queryClient.invalidateQueries({ queryKey: ['students'] });
        queryClient.invalidateQueries({ queryKey: ['batches'] });
      } else {
        const res = await api.post('/parents', {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone,
          altPhone: values.altPhone,
          contactEmail: values.contactEmail || undefined,
          currentAddress: values.currentAddress,
          permanentAddress: values.permanentAddress,
          occupation: values.occupation,
        });
        toast.success(`Parent account created. Temp password: ${res.data.tempPassword}`, { duration: 8000 });
        queryClient.invalidateQueries({ queryKey: ['parents'] });
      }
      closeAddUser();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/users/${id}/${isActive ? 'deactivate' : 'activate'}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function resetPasswordGenerated(id: string) {
    try {
      const res = await api.post(`/users/${id}/reset-password`);
      toast.success(`Temp password: ${res.data.tempPassword}`, { duration: 10000 });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function resetPasswordCustom() {
    if (!resetTarget) return;
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { customPassword });
      toast.success('Password updated. The user can sign in with it immediately.');
      setResetTarget(null);
      setCustomPassword('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const needsProfileFields = selectedRole === 'FACULTY' || selectedRole === 'STUDENT' || selectedRole === 'PARENT';
  const modalWide = selectedRole === 'STUDENT' || selectedRole === 'PARENT';

  return (
    <div>
      <div className="filter-row mb-3">
        <input className="input w-64 max-lg:w-full" placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isSuperAdmin && (
          <button className="btn-secondary" onClick={openAddUser}>+ Add User</button>
        )}
      </div>
      <Table
        loading={isLoading}
        rows={data?.items ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Email', cell: (r: any) => r.email },
          { header: 'Role', cell: (r: any) => <Badge>{roleLabel(r.role)}</Badge> },
          { header: 'Last Login', cell: (r: any) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : 'Never') },
          { header: 'Status', cell: (r: any) => <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            header: 'Actions',
            cell: (r: any) => (
              <div className="flex flex-row flex-wrap gap-2 max-lg:flex-col">
                <button className="text-xs text-brand-ink hover:underline" onClick={() => toggleActive(r.id, r.isActive)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                <button className="text-xs text-ink-muted hover:underline" onClick={() => resetPasswordGenerated(r.id)}>Generate Temp Password</button>
                <button className="text-xs text-ink-muted hover:underline" onClick={() => setResetTarget(r)}>Set Custom Password</button>
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!resetTarget} onClose={() => { setResetTarget(null); setCustomPassword(''); }} title="Set Custom Password">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Set a specific password for <span className="font-medium text-ink">{resetTarget?.email}</span>. They can sign in with it immediately, no forced change.</p>
          <label className="block"><span className="label">New Password</span><input className="input" type="text" value={customPassword} onChange={(e) => setCustomPassword(e.target.value)} /></label>
          <p className="text-xs text-ink-muted">At least 12 characters, with upper and lower case letters and a number.</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={resetPasswordCustom}>Set Password</button></div>
        </div>
      </Modal>

      <Modal open={addUserOpen} onClose={closeAddUser} title="Add User" wide={modalWide}>
        <form onSubmit={addUserForm.handleSubmit(onCreateUser)} className="space-y-3">
          <label className="block">
            <span className="label">Role</span>
            <select className="input" {...addUserForm.register('role', { required: true })}>
              <option value="ACADEMIC_ADMIN">{roleLabel('ACADEMIC_ADMIN')}</option>
              <option value="FACULTY">{roleLabel('FACULTY')}</option>
              <option value="STUDENT">{roleLabel('STUDENT')}</option>
              <option value="PARENT">{roleLabel('PARENT')}</option>
            </select>
          </label>

          {needsProfileFields && (
            <div className={modalWide ? 'form-grid' : 'space-y-3'}>
              <label className="block"><span className="label">First Name</span><input className="input" {...addUserForm.register('firstName', { required: true })} /></label>
              <label className="block"><span className="label">Last Name</span><input className="input" {...addUserForm.register('lastName', { required: true })} /></label>
            </div>
          )}

          {selectedRole === 'FACULTY' && (
            <>
              <label className="block"><span className="label">Employee Code</span><input className="input" {...addUserForm.register('employeeCode', { required: true })} /></label>
              <label className="block"><span className="label">Department</span><input className="input" {...addUserForm.register('department')} /></label>
              <label className="block"><span className="label">Designation</span><input className="input" {...addUserForm.register('designation')} /></label>
            </>
          )}

          {selectedRole === 'STUDENT' && (
            <>
              <label className="block"><span className="label">Student Code</span><input className="input" {...addUserForm.register('studentCode', { required: true })} /></label>
              <label className="block">
                <span className="label">Batch (optional)</span>
                <select className="input" value={selectedBatchId ?? ''} onChange={(e) => onBatchChange(e.target.value)}>
                  <option value="">No batch yet</option>
                  {batches?.items?.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}{b.course?.name ? ` (${b.course.name})` : ''}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-muted">
                <input type="checkbox" className="mt-0.5" {...addUserForm.register('consentGranted')} />
                <span>The student (or their guardian) has given consent for the institute to process their personal data. Enrolment cannot proceed without this.</span>
              </label>
            </>
          )}

          {selectedRole === 'PARENT' && (
            <div className="form-grid">
              <label className="block"><span className="label">Main Mobile</span><input className="input" {...addUserForm.register('phone')} /></label>
              <label className="block"><span className="label">Alternative Mobile</span><input className="input" {...addUserForm.register('altPhone')} /></label>
              <label className="block"><span className="label">Contact Email (optional)</span><input className="input" type="email" {...addUserForm.register('contactEmail')} /></label>
              <label className="block"><span className="label">Occupation</span><input className="input" {...addUserForm.register('occupation')} /></label>
              <label className="block col-span-2"><span className="label">Current Address</span><input className="input" {...addUserForm.register('currentAddress')} /></label>
              <label className="block col-span-2"><span className="label">Permanent Address</span><input className="input" {...addUserForm.register('permanentAddress')} /></label>
            </div>
          )}

          <label className="block">
            <span className="label">{selectedRole === 'PARENT' ? 'Login Email (Username)' : 'Email'}</span>
            <input className="input" type="email" {...addUserForm.register('email', { required: true })} />
          </label>

          <p className="text-xs text-ink-muted">
            {selectedRole === 'ACADEMIC_ADMIN' && 'Creates an Academic Admin account. A temporary password is generated on creation.'}
            {selectedRole === 'FACULTY' && 'Creates a Team Member account. A temporary password is generated on creation.'}
            {selectedRole === 'STUDENT' && 'Creates a Student account. Assign a batch now or enrol them later from Batches.'}
            {selectedRole === 'PARENT' && 'Creates a Parent account. Link students from Community > Parents after creation.'}
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeAddUser}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
