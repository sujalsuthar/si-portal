import { RoleName } from '@/types';

/** Shared role groups for nav visibility (Layout) and route-level access guards (App/ProtectedRoute) -
 * a single source of truth so hiding a nav item and blocking its route never drift apart. */
export const STAFF: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY'];
export const ADMIN_LIKE: RoleName[] = ['SUPER_ADMIN', 'ACADEMIC_ADMIN'];
export const SESSION_ROLES: RoleName[] = STAFF;
export const EXAM_ROLES: RoleName[] = [...STAFF, 'STUDENT'];
export const INTERN_ROLES: RoleName[] = [...STAFF, 'STUDENT'];
export const COMMUNITY_ROLES: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN'];
export const PEOPLE_ROUTES_ROLES: RoleName[] = STAFF;
export const PERFORMANCE_STAFF: RoleName[] = [...STAFF, 'ACCOUNTS'];
// Fees: Super Admin, Academic Admin and Accounts have full access per README SAMP 2.0 row 4.
export const FEE_ROLES: RoleName[] = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'ACCOUNTS', 'MANAGEMENT', 'PARENT', 'STUDENT'];
// Reports removed from Faculty/Team navigation per the 4.0 issue log.
export const REPORTS_ROLES: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'ACCOUNTS'];
// Certificates removed from Student/Parent and Team navigation per the 4.0 issue log (public QR verification is unaffected).
export const CERTIFICATE_ROLES: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'ACCOUNTS'];
// Performance and Projects removed from Parent navigation per the 4.0 issue log.
export const NOT_PARENT: RoleName[] = ['SUPER_ADMIN', 'MANAGEMENT', 'ACADEMIC_ADMIN', 'FACULTY', 'ACCOUNTS', 'STUDENT'];
