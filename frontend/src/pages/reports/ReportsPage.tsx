import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui';

const REPORTS = [
  { key: 'students', label: 'Student Report', description: 'Attendance, exams, tasks and composite score per student.' },
  { key: 'batches', label: 'Batch Report', description: 'Strength, attendance and academic average per batch.' },
  { key: 'attendance', label: 'Attendance Report', description: 'Full attendance log across sessions.' },
  { key: 'task-completion', label: 'Task Completion Report', description: 'Completion and late-submission rates per task.' },
  { key: 'behaviour', label: 'Behaviour Report', description: 'All recorded behaviour events.' },
  { key: 'interns', label: 'Intern Report', description: 'Batch, mentor, status and latest rating for every intern.' },
];

export default function ReportsPage() {
  async function download(key: string, label: string) {
    try {
      const res = await api.get(`/reports/${key}.xlsx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${key}-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not export ${label}`));
    }
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Export institute, batch, faculty and student reports to Excel." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.key} className="card p-4">
            <p className="font-medium text-ink">{r.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
            <button className="btn-secondary mt-3 w-full" onClick={() => download(r.key, r.label)}>Download Excel</button>
          </div>
        ))}
      </div>
    </div>
  );
}
