import { useState } from 'react';
import { RoleName } from '@/types';
import { roleLabel } from '@/lib/roleLabels';

const TIPS: Record<RoleName, string[]> = {
  SUPER_ADMIN: [
    'Dashboard shows institute health and search in the header finds anyone.',
    'People, Teaching, and System groups in the sidebar organize daily work vs rare admin tools.',
    'Use Settings for users, MFA policies, and organisation; Backup lives under System.',
  ],
  MANAGEMENT: [
    'Dashboard highlights KPIs and batch performance.',
    'Use Reports and Fees for oversight; Teaching tools are in the sidebar.',
    'Settings holds audit visibility where permitted.',
  ],
  ACADEMIC_ADMIN: [
    'Start on Dashboard for pending transfers and today’s schedule.',
    'People and Teaching groups cover students, batches, sessions, and exams.',
    'Raise or track requests via Action Centre when needed; Settings manages users.',
  ],
  FACULTY: [
    'Dashboard lists today’s classes and pending evaluations.',
    'Open Sessions to take attendance; Intern Projects are under Projects.',
    'Action Centre is for student concerns and requests.',
  ],
  ACCOUNTS: [
    'Fees is your home base for payments and accounts.',
    'Reports and Certificates support reconciliation and proof.',
    'Action Centre catches fee-related requests.',
  ],
  STUDENT: [
    'Dashboard shows overdue tasks, attendance, and upcoming sessions.',
    'Use Tasks, Performance, and Projects for coursework; Fees for payments.',
    'Action Centre is how you raise requests to the institute.',
  ],
  PARENT: [
    'Dashboard shows each child’s attendance and progress at a glance.',
    'Fees and Action Centre are the main places for payments and requests.',
    'Feed carries institute announcements.',
  ],
};

export default function OnboardingCard({ role, userId }: { role: RoleName; userId: string }) {
  const key = `si_onboarding_done_${userId}_${role}`;
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  if (done) return null;

  const tips = TIPS[role] ?? TIPS.STUDENT;

  function dismiss() {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    setDone(true);
  }

  return (
    <div className="card mb-5 border-brand-300 bg-brand-50/40 p-4 dark:border-brand-700 dark:bg-brand-900/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Welcome — you’re signed in as {roleLabel(role)}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
