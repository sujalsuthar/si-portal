import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui';

export default function OrganisationTab() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const queryClient = useQueryClient();
  const [section, setSection] = useState<'Institution' | 'Holidays' | 'Notification Templates' | 'Breach Register'>('Institution');

  const canEditInternManager = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const { data: institution } = useQuery({ queryKey: ['institution'], queryFn: async () => (await api.get('/settings/institution')).data });
  const { data: facultyList } = useQuery({ queryKey: ['faculty', 'all'], queryFn: async () => (await api.get('/faculty', { params: { pageSize: 100, activeOnly: true } })).data, enabled: section === 'Institution' });
  const { data: holidays } = useQuery({ queryKey: ['holidays'], queryFn: async () => (await api.get('/settings/holidays')).data });
  const { data: templates } = useQuery({ queryKey: ['notification-templates'], queryFn: async () => (await api.get('/settings/notification-templates')).data });
  const { data: breaches } = useQuery({ queryKey: ['breaches'], queryFn: async () => (await api.get('/settings/breaches')).data, enabled: isSuperAdmin });

  const [instForm, setInstForm] = useState<any>(null);
  const inst = instForm ?? institution;

  async function saveInstitution() {
    try {
      await api.put('/settings/institution', inst);
      toast.success('Institution profile updated');
      setInstForm(null);
      queryClient.invalidateQueries({ queryKey: ['institution'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  async function addHoliday() {
    if (!holidayForm.date || !holidayForm.name) return toast.error('Fill in date and name');
    try {
      await api.post('/settings/holidays', holidayForm);
      setHolidayForm({ date: '', name: '' });
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }
  async function removeHoliday(id: string) {
    await api.delete(`/settings/holidays/${id}`);
    queryClient.invalidateQueries({ queryKey: ['holidays'] });
  }

  const [templateForm, setTemplateForm] = useState({ category: 'GENERAL', channel: 'EMAIL', subjectTemplate: '', bodyTemplate: '' });
  async function saveTemplate() {
    try {
      await api.put('/settings/notification-templates', templateForm);
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const [breachForm, setBreachForm] = useState({ title: '', description: '', affectedCount: '', detectedAt: '' });
  async function addBreach() {
    if (!breachForm.title || !breachForm.detectedAt) return toast.error('Fill in title and detected date');
    try {
      await api.post('/settings/breaches', { ...breachForm, affectedCount: Number(breachForm.affectedCount || 0) });
      setBreachForm({ title: '', description: '', affectedCount: '', detectedAt: '' });
      queryClient.invalidateQueries({ queryKey: ['breaches'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-edge">
        {(['Institution', 'Holidays', 'Notification Templates', ...(isSuperAdmin ? (['Breach Register'] as const) : [])] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSection(t)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${section === t ? 'border-brand-600 text-brand-ink' : 'border-transparent text-ink-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {section === 'Institution' && inst && (
        <div className="max-w-lg space-y-3">
          <label className="block"><span className="label">Name</span><input className="input" value={inst.name ?? ''} onChange={(e) => setInstForm({ ...inst, name: e.target.value })} /></label>
          <label className="block"><span className="label">Address</span><input className="input" value={inst.address ?? ''} onChange={(e) => setInstForm({ ...inst, address: e.target.value })} /></label>
          <label className="block"><span className="label">Contact Email</span><input className="input" value={inst.contactEmail ?? ''} onChange={(e) => setInstForm({ ...inst, contactEmail: e.target.value })} /></label>
          <label className="block"><span className="label">Contact Phone</span><input className="input" value={inst.contactPhone ?? ''} onChange={(e) => setInstForm({ ...inst, contactPhone: e.target.value })} /></label>
          <label className="block"><span className="label">Google Drive URL (for student task submissions)</span><input className="input" type="url" placeholder="https://drive.google.com/..." value={inst.googleDriveUrl ?? ''} onChange={(e) => setInstForm({ ...inst, googleDriveUrl: e.target.value })} /></label>
          <label className="block">
            <span className="label">Intern Manager (oversees all interns institute-wide)</span>
            <select
              className="input"
              disabled={!canEditInternManager}
              value={inst.internManagerId ?? ''}
              onChange={(e) => setInstForm({ ...inst, internManagerId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {facultyList?.items?.map((f: any) => <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-muted">Distinct from each intern's own Task Mentor, set per-intern on their Intern profile.</p>
          </label>
          <button className="btn-primary" onClick={saveInstitution}>Save</button>
        </div>
      )}

      {section === 'Holidays' && (
        <div className="max-w-lg">
          <div className="mb-3 flex gap-2">
            <input className="input" type="date" value={holidayForm.date} onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))} />
            <input className="input" placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} />
            <button className="btn-secondary shrink-0" onClick={addHoliday}>Add</button>
          </div>
          <div className="card divide-y divide-edge">
            {(holidays ?? []).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{new Date(h.date).toDateString()} - {h.name}</span>
                <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => removeHoliday(h.id)}>Remove</button>
              </div>
            ))}
            {(holidays ?? []).length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No holidays configured</p>}
          </div>
        </div>
      )}

      {section === 'Notification Templates' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="form-grid">
              <select className="input" value={templateForm.category} onChange={(e) => setTemplateForm((f) => ({ ...f, category: e.target.value }))}>
                {['ATTENDANCE', 'EXAM', 'TASK', 'GRADE', 'PRESENTATION', 'CERTIFICATION', 'CERTIFICATE', 'BATCH_TRANSFER', 'BEHAVIOUR', 'GENERAL'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" value={templateForm.channel} onChange={(e) => setTemplateForm((f) => ({ ...f, channel: e.target.value }))}>
                {['EMAIL', 'SMS', 'WHATSAPP'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label className="block"><span className="label">Subject ({'{{title}}'} / {'{{message}}'})</span><input className="input" value={templateForm.subjectTemplate} onChange={(e) => setTemplateForm((f) => ({ ...f, subjectTemplate: e.target.value }))} /></label>
            <label className="block"><span className="label">Body</span><textarea className="input" rows={3} value={templateForm.bodyTemplate} onChange={(e) => setTemplateForm((f) => ({ ...f, bodyTemplate: e.target.value }))} /></label>
            <button className="btn-primary" onClick={saveTemplate}>Save Template</button>
          </div>
          <div className="card divide-y divide-edge">
            {(templates ?? []).map((t: any) => (
              <div key={t.id} className="px-3 py-2 text-sm">
                <p className="font-medium text-ink">{t.category} · {t.channel}</p>
                <p className="text-xs text-ink-muted">{t.subjectTemplate}</p>
              </div>
            ))}
            {(templates ?? []).length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No custom templates - hardcoded copy is used</p>}
          </div>
        </div>
      )}

      {section === 'Breach Register' && (
        <div>
          <div className="mb-3 form-grid-3 max-w-2xl">
            <input className="input sm:col-span-2" placeholder="Title" value={breachForm.title} onChange={(e) => setBreachForm((f) => ({ ...f, title: e.target.value }))} />
            <input className="input" type="number" placeholder="Affected" value={breachForm.affectedCount} onChange={(e) => setBreachForm((f) => ({ ...f, affectedCount: e.target.value }))} />
            <input className="input" type="date" value={breachForm.detectedAt} onChange={(e) => setBreachForm((f) => ({ ...f, detectedAt: e.target.value }))} />
          </div>
          <textarea className="input mb-3 max-w-2xl" rows={2} placeholder="Description" value={breachForm.description} onChange={(e) => setBreachForm((f) => ({ ...f, description: e.target.value }))} />
          <button className="btn-primary mb-4" onClick={addBreach}>Log Breach</button>
          <div className="card divide-y divide-edge">
            {(breaches ?? []).map((b: any) => (
              <div key={b.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{b.title}</span>
                  <Badge tone={b.notifiedAt ? 'green' : 'amber'}>{b.notifiedAt ? 'Notified' : 'Pending Notification'}</Badge>
                </div>
                <p className="text-xs text-ink-muted">{b.description} · Affected: {b.affectedCount} · Detected {new Date(b.detectedAt).toDateString()}</p>
              </div>
            ))}
            {(breaches ?? []).length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No breaches on file</p>}
          </div>
        </div>
      )}
    </div>
  );
}
