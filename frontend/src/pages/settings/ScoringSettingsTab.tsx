import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { RoleName } from '@/types';
import { roleLabel } from '@/lib/roleLabels';

const FIELDS = [
  ['attendanceWeight', 'Attendance'],
  ['examWeight', 'Exams / Academic'],
  ['taskWeight', 'Tasks'],
  ['behaviourWeight', 'Behaviour / Professionalism'],
  ['presentationWeight', 'Presentations'],
  ['certificationWeight', 'Certifications / Development'],
  ['selfAssessmentWeight', 'Self-Assessment / Reflection'],
  ['projectWeight', 'Projects'],
] as const;

const ALL_ROLES: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY', 'ACCOUNTS', 'STUDENT', 'PARENT'];

export default function ScoringSettingsTab() {
  const { data } = useQuery({ queryKey: ['settings', 'scoring'], queryFn: async () => (await api.get('/settings/scoring')).data });
  const [form, setForm] = useState<Record<string, string>>({});
  const [threshold, setThreshold] = useState('75');
  const [internThreshold, setInternThreshold] = useState('50');
  const [retentionYears, setRetentionYears] = useState('2');
  const [mfaRoles, setMfaRoles] = useState<RoleName[]>([]);

  useEffect(() => {
    if (data) {
      setForm(Object.fromEntries(FIELDS.map(([key]) => [key, String(data[key])])));
      setThreshold(String(data.attendanceThreshold));
      setInternThreshold(String(data.internPerformanceThreshold));
      setRetentionYears(String(data.batchRetentionYears));
      setMfaRoles(data.mfaRequiredRoles ?? []);
    }
  }, [data]);

  const total = FIELDS.reduce((sum, [key]) => sum + Number(form[key] || 0), 0);

  function toggleRole(role: RoleName) {
    setMfaRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function save() {
    try {
      const payload = Object.fromEntries(FIELDS.map(([key]) => [key, Number(form[key])]));
      await api.put('/settings/scoring', {
        ...payload,
        attendanceThreshold: Number(threshold),
        internPerformanceThreshold: Number(internThreshold),
        batchRetentionYears: Number(retentionYears),
        mfaRequiredRoles: mfaRoles,
      });
      toast.success('Settings updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <p className="mb-3 text-sm text-ink-muted">
          Composite score weights (Default Parameters). Used for guidance and recognition - Intern of the Month and
          Batch of the Year are computed from these - never as the sole basis for disciplinary decisions.
        </p>
        <div className="card space-y-3 p-4">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">{label}</span>
              <input className="input w-24" type="number" value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </label>
          ))}
          <div className="flex items-center justify-between border-t border-edge pt-3 text-sm font-medium">
            <span>Total</span>
            <span className={total === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{total}%</span>
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">Attendance Alert Threshold (%)</span>
          <input className="input w-24" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <label className="flex items-center justify-between gap-3 border-t border-edge pt-3">
          <span className="text-sm text-ink">Intern Performance Freeze Threshold</span>
          <input className="input w-24" type="number" value={internThreshold} onChange={(e) => setInternThreshold(e.target.value)} />
        </label>
        <label className="flex items-center justify-between gap-3 border-t border-edge pt-3">
          <span className="text-sm text-ink">Batch Retention Period (years) before final archive</span>
          <input className="input w-24" type="number" value={retentionYears} onChange={(e) => setRetentionYears(e.target.value)} />
        </label>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Roles Required to Set Up Two-Factor Authentication</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mfaRoles.includes(role)} onChange={() => toggleRole(role)} />
              {roleLabel(role)}
            </label>
          ))}
        </div>
      </div>

      <button className="btn-primary" onClick={save}>Save Settings</button>
    </div>
  );
}
