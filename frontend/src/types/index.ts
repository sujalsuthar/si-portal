export type RoleName = 'SUPER_ADMIN' | 'MANAGEMENT' | 'ACADEMIC_ADMIN' | 'FACULTY' | 'ACCOUNTS' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: string;
  email: string;
  role: RoleName;
  mustChangePassword: boolean;
  mustSetupMfa: boolean;
  mfaEnabled: boolean;
  profile: { id: string; firstName?: string; lastName?: string } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
