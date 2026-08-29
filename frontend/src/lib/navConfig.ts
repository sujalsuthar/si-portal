import { RoleName } from '@/types';
import {
  STAFF,
  ADMIN_LIKE,
  FEE_ROLES,
  REPORTS_ROLES,
  CERTIFICATE_ROLES,
  NOT_PARENT,
  PEOPLE_ROUTES_ROLES,
} from '@/lib/navRoles';

export type NavIconId =
  | 'home'
  | 'feed'
  | 'calendar'
  | 'sessions'
  | 'tasks'
  | 'exams'
  | 'library'
  | 'people'
  | 'students'
  | 'parents'
  | 'team'
  | 'batches'
  | 'courses'
  | 'interns'
  | 'projects'
  | 'fees'
  | 'certificates'
  | 'reports'
  | 'action'
  | 'settings'
  | 'backup'
  | 'account'
  | 'performance'
  | 'profile';

export interface NavLinkItem {
  to: string;
  label: string;
  icon: NavIconId;
  roles?: RoleName[];
  /** When set, only show for this role (more specific than roles[]) */
  onlyRoles?: RoleName[];
  end?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  /** Collapse by default (SYSTEM) */
  defaultCollapsed?: boolean;
  items: NavLinkItem[];
  /** If set, entire group only visible when role matches any item */
  roles?: RoleName[];
}

const ALL: RoleName[] = [
  'SUPER_ADMIN',
  'MANAGEMENT',
  'ACADEMIC_ADMIN',
  'FACULTY',
  'ACCOUNTS',
  'STUDENT',
  'PARENT',
];

/** Canonical grouped nav — filtered per role at render time. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/feed', label: 'Feed', icon: 'feed' },
      { to: '/calendar', label: 'Calendar', icon: 'calendar', roles: NOT_PARENT },
    ],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    roles: [...STAFF, 'STUDENT'],
    items: [
      { to: '/sessions', label: 'Sessions', icon: 'sessions', roles: STAFF },
      { to: '/tasks', label: 'Tasks', icon: 'tasks', roles: [...STAFF, 'STUDENT'] },
      { to: '/exams', label: 'Exams', icon: 'exams', roles: STAFF },
      { to: '/library', label: 'Library', icon: 'library', roles: STAFF },
      { to: '/performance', label: 'Performance', icon: 'performance', roles: [...STAFF, 'STUDENT', 'ACCOUNTS'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    roles: PEOPLE_ROUTES_ROLES,
    items: [
      { to: '/people/students', label: 'Students', icon: 'students', roles: PEOPLE_ROUTES_ROLES },
      { to: '/people/parents', label: 'Parents', icon: 'parents', roles: PEOPLE_ROUTES_ROLES },
      { to: '/people/faculty', label: 'Team', icon: 'team', roles: PEOPLE_ROUTES_ROLES },
      { to: '/batches', label: 'Batches', icon: 'batches', roles: PEOPLE_ROUTES_ROLES },
      { to: '/people/courses', label: 'Courses', icon: 'courses', roles: PEOPLE_ROUTES_ROLES },
      { to: '/interns', label: 'Interns', icon: 'interns', roles: STAFF },
    ],
  },
      {
        id: 'projects',
        label: 'Projects',
        roles: STAFF.concat(['STUDENT'] as RoleName[]),
        items: [
          {
            to: '/projects/students',
            label: 'Student Projects',
            icon: 'projects',
            roles: ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN'],
          },
          { to: '/projects/interns', label: 'Intern Projects', icon: 'projects', roles: STAFF },
          { to: '/projects', label: 'Projects', icon: 'projects', onlyRoles: ['STUDENT'] },
        ],
      },
  {
    id: 'money',
    label: 'Money & proof',
    items: [
      { to: '/fees', label: 'Fees', icon: 'fees', roles: FEE_ROLES },
      { to: '/certificates', label: 'Certificates', icon: 'certificates', roles: CERTIFICATE_ROLES },
      { to: '/reports', label: 'Reports', icon: 'reports', roles: REPORTS_ROLES },
      {
        to: '/action-centre',
        label: 'Action Centre',
        icon: 'action',
        roles: ['FACULTY', 'STUDENT', 'PARENT', 'MANAGEMENT', 'ACCOUNTS'],
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    defaultCollapsed: true,
    roles: [...ADMIN_LIKE, 'SUPER_ADMIN', 'MANAGEMENT', ...ALL],
    items: [
      { to: '/account-management', label: 'Account Management', icon: 'account', roles: ['SUPER_ADMIN'] },
      { to: '/backup', label: 'Backup', icon: 'backup', roles: ADMIN_LIKE },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

function itemVisible(item: NavLinkItem, role: RoleName): boolean {
  if (item.onlyRoles) return item.onlyRoles.includes(role);
  if (!item.roles) return true;
  return item.roles.includes(role);
}

/** Slim overrides: Parent & Accounts get a short dedicated list. */
export function getNavGroupsForRole(role: RoleName, studentProfileId?: string | null): NavGroup[] {
  if (role === 'PARENT') {
    return [
      {
        id: 'home',
        label: 'Home',
        items: [
          { to: '/', label: 'Dashboard', icon: 'home', end: true },
          { to: '/feed', label: 'Feed', icon: 'feed' },
          { to: '/fees', label: 'Fees', icon: 'fees' },
          { to: '/action-centre', label: 'Action Centre', icon: 'action' },
          { to: '/settings', label: 'Settings', icon: 'settings' },
        ],
      },
    ];
  }

  if (role === 'ACCOUNTS') {
    return [
      {
        id: 'home',
        label: 'Home',
        items: [
          { to: '/', label: 'Dashboard', icon: 'home', end: true },
          { to: '/fees', label: 'Fees', icon: 'fees' },
          { to: '/reports', label: 'Reports', icon: 'reports' },
          { to: '/certificates', label: 'Certificates', icon: 'certificates' },
          { to: '/action-centre', label: 'Action Centre', icon: 'action' },
          { to: '/performance', label: 'Performance', icon: 'performance' },
          { to: '/settings', label: 'Settings', icon: 'settings' },
        ],
      },
    ];
  }

  if (role === 'STUDENT') {
    const items: NavLinkItem[] = [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/feed', label: 'Feed', icon: 'feed' },
      { to: '/tasks', label: 'Tasks', icon: 'tasks' },
      { to: '/performance', label: 'Performance', icon: 'performance' },
      { to: '/projects', label: 'Projects', icon: 'projects' },
      { to: '/fees', label: 'Fees', icon: 'fees' },
      { to: '/action-centre', label: 'Action Centre', icon: 'action' },
      { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    ];
    if (studentProfileId) {
      items.push({ to: `/my/${studentProfileId}`, label: 'My profile', icon: 'profile' });
    }
    items.push({ to: '/settings', label: 'Settings', icon: 'settings' });
    return [{ id: 'home', label: 'Home', items }];
  }

  return NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => itemVisible(item, role));
    return { ...group, items };
  }).filter((group) => group.items.length > 0);
}

export const BREADCRUMB_LABELS: Record<string, string> = {
  '': 'Dashboard',
  feed: 'Feed',
  sessions: 'Sessions',
  exams: 'Exams',
  library: 'Library',
  tasks: 'Tasks',
  performance: 'Performance',
  interns: 'Interns',
  projects: 'Projects',
  students: 'Students',
  fees: 'Fees',
  certificates: 'Certificates',
  reports: 'Reports',
  'action-centre': 'Action Centre',
  calendar: 'Calendar',
  'account-management': 'Account Management',
  backup: 'Backup',
  settings: 'Settings',
  notifications: 'Notifications',
  people: 'People',
  parents: 'Parents',
  faculty: 'Team',
  courses: 'Courses',
  batches: 'Batches',
  search: 'Search',
  my: 'My profile',
  questions: 'Question Bank',
  marksheet: 'Mark sheet',
  take: 'Take exam',
};

/** Prefer longer path labels when segment alone is ambiguous. */
export function breadcrumbForPath(pathname: string): { to: string; label: string }[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [{ to: '/', label: 'Dashboard' }];

  const crumbs: { to: string; label: string }[] = [{ to: '/', label: 'Dashboard' }];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    acc += `/${seg}`;
    // Skip opaque ids in breadcrumbs
    if (/^[a-z0-9]{20,}$/i.test(seg) || seg.startsWith('cmt')) {
      crumbs.push({ to: acc, label: 'Detail' });
      continue;
    }
    let label = BREADCRUMB_LABELS[seg] ?? seg.replace(/-/g, ' ');
    if (parts[0] === 'projects' && seg === 'students') label = 'Student Projects';
    if (parts[0] === 'projects' && seg === 'interns') label = 'Intern Projects';
    if (parts[0] === 'people' && seg === 'students') label = 'Students';
    crumbs.push({ to: acc, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return crumbs;
}
