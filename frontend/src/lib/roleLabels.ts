import { RoleName } from '@/types';

// "Team" replaces "Faculty" everywhere in the interface, per the SAMP 2.0 spec - the underlying
// role value stored in the database and API stays FACULTY for stability, but no user-facing text
// should ever say "Faculty".
export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGEMENT: 'Management',
  ACADEMIC_ADMIN: 'Academic Admin',
  FACULTY: 'Team',
  ACCOUNTS: 'Accounts',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export function roleLabel(role: RoleName): string {
  return ROLE_LABELS[role] ?? role;
}
