import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, TabBar } from '@/components/ui';
import BehaviourTab from './BehaviourTab';
import PresentationsTab from './PresentationsTab';
import StudentOfMonthTab from './StudentOfMonthTab';
import InterventionsTab from './InterventionsTab';
import SelfAssessmentTab from '@/pages/development/SelfAssessmentTab';
import MarksTab from './MarksTab';
import OverviewTab from './OverviewTab';
import StudentPerformanceOverview from './StudentPerformanceOverview';
import BatchesList from '@/pages/batches/BatchesList';
import StudentsList from '@/pages/students/StudentsList';
import ParentsList from '@/pages/students/ParentsList';
import FacultyList from '@/pages/students/FacultyList';
import { COMMUNITY_ROLES } from '@/lib/navRoles';

const FULL_STAFF_ROLES = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'];
const PERFORMANCE_STAFF_ROLES = [...FULL_STAFF_ROLES, 'ACCOUNTS'];

/** Community groups Students/Parents/Team behind their existing sub-tab bar (merged from the former "People" nav item). */
function CommunityTab() {
  const [sub, setSub] = useState<'students' | 'parents' | 'team'>('students');
  return (
    <div>
      <PeopleTabsOverride sub={sub} setSub={setSub} />
      {sub === 'students' && <StudentsList />}
      {sub === 'parents' && <ParentsList />}
      {sub === 'team' && <FacultyList />}
    </div>
  );
}

function PeopleTabsOverride({ sub, setSub }: { sub: string; setSub: (s: 'students' | 'parents' | 'team') => void }) {
  const tabs: { key: 'students' | 'parents' | 'team'; label: string }[] = [
    { key: 'students', label: 'Students' },
    { key: 'parents', label: 'Parents' },
    { key: 'team', label: 'Team' },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-edge">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setSub(t.key)}
          className={`tab-bar-item ${sub === t.key ? 'tab-bar-item-active' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function PerformanceHub() {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const isFullStaff = user && FULL_STAFF_ROLES.includes(user.role);
  const isAccounts = user?.role === 'ACCOUNTS';
  const isPerformanceStaff = user && PERFORMANCE_STAFF_ROLES.includes(user.role);
  const canSeeCommunity = user && COMMUNITY_ROLES.includes(user.role);

  if (isStudent) {
    return (
      <div>
        <PageHeader title="Performance" subtitle="Your behaviour, presentations, self-assessments, and exam history." />
        <StudentPerformanceOverview />
      </div>
    );
  }

  const tabs = isFullStaff
    ? [
        'Batches',
        ...(canSeeCommunity ? ['Community'] : []),
        'Behaviour',
        'Presentations',
        'Intern of the Month',
        'Requiring Attention',
        'Self-Assessment',
      ]
    : isAccounts
      ? ['Batches', 'Behaviour', 'Presentations']
      : ['Overview', 'Behaviour', 'Presentations', 'Self-Assessment', 'Marks'];
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div>
      <PageHeader title="Performance" subtitle="Batches, community, behaviour, points, presentations and recognition." />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'Overview' && !isPerformanceStaff && <OverviewTab onNavigate={setTab} />}
      {tab === 'Batches' && isPerformanceStaff && <BatchesList />}
      {tab === 'Community' && canSeeCommunity && <CommunityTab />}
      {tab === 'Behaviour' && <BehaviourTab />}
      {tab === 'Presentations' && <PresentationsTab />}
      {tab === 'Intern of the Month' && isFullStaff && <StudentOfMonthTab />}
      {tab === 'Requiring Attention' && isFullStaff && <InterventionsTab />}
      {tab === 'Self-Assessment' && <SelfAssessmentTab />}
      {tab === 'Marks' && !isPerformanceStaff && <MarksTab />}
    </div>
  );
}
