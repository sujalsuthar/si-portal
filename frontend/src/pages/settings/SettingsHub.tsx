import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, TabBar } from '@/components/ui';
import ScoringSettingsTab from './ScoringSettingsTab';
import UsersTab from './UsersTab';
import AuditLogTab from './AuditLogTab';
import ProfilePasswordTab from './ProfilePasswordTab';
import DuplicatesTab from './DuplicatesTab';
import OrganisationTab from './OrganisationTab';

export default function SettingsHub() {
  const { user } = useAuth();
  const canManageUsers = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const canViewAudit = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'MANAGEMENT'].includes(user.role);
  const canEditScoring = user && ['SUPER_ADMIN', 'MANAGEMENT'].includes(user.role);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const adminTabs = [
    ...(canEditScoring ? ['Default Parameters'] : []),
    ...(canManageUsers ? ['Users'] : []),
    ...(canViewAudit ? ['Audit Log'] : []),
    ...(isSuperAdmin ? ['Duplicate Monitoring'] : []),
    ...(canEditScoring ? ['Organisation'] : []),
  ];
  const [tab, setTab] = useState(adminTabs[0] ?? '');

  return (
    <div>
      <PageHeader title="Settings" />
      <ProfilePasswordTab />
      {adminTabs.length > 0 && (
        <>
          <div className="mt-8">
            <TabBar tabs={adminTabs} active={tab} onChange={setTab} />
          </div>
          {tab === 'Default Parameters' && canEditScoring && <ScoringSettingsTab />}
          {tab === 'Users' && canManageUsers && <UsersTab />}
          {tab === 'Audit Log' && canViewAudit && <AuditLogTab />}
          {tab === 'Duplicate Monitoring' && isSuperAdmin && <DuplicatesTab />}
          {tab === 'Organisation' && canEditScoring && <OrganisationTab />}
        </>
      )}
    </div>
  );
}
