export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  school_owner: [
    'dashboard:read',
    'school:read',
    'school:settings',
    'users:read',
    'users:manage',
    'students:read',
    'students:manage',
    'students:export',
    'academics:read',
    'academics:manage',
    'attendance:read',
    'attendance:mark',
    'attendance:manage',
    'fees:read',
    'fees:manage',
    'fees:collect',
    'fees:reverse',
    'exams:read',
    'exams:manage',
    'timetable:read',
    'timetable:manage',
    'staff:read',
    'staff:manage',
    'reports:read',
    'reports:export',
    'database:backup',
    'sync:trigger',
  ],
  principal: [
    'dashboard:read',
    'school:read',
    'users:read',
    'students:read',
    'students:manage',
    'students:export',
    'academics:read',
    'academics:manage',
    'attendance:read',
    'attendance:mark',
    'attendance:manage',
    'fees:read',
    'exams:read',
    'exams:manage',
    'timetable:read',
    'timetable:manage',
    'staff:read',
    'reports:read',
    'reports:export',
  ],
  school_admin: [
    'dashboard:read',
    'school:read',
    'students:read',
    'students:manage',
    'students:export',
    'academics:read',
    'attendance:read',
    'attendance:mark',
    'fees:read',
    'fees:collect',
    'exams:read',
    'staff:read',
    'reports:read',
  ],
  accountant: [
    'dashboard:read',
    'school:read',
    'students:read',
    'fees:read',
    'fees:manage',
    'fees:collect',
    'fees:reverse',
    'reports:read',
    'reports:export',
  ],
  teacher: [
    'dashboard:read',
    'students:read',
    'attendance:read',
    'attendance:mark',
    'exams:read',
    'timetable:read',
  ],
  staff: [
    'dashboard:read',
    'students:read',
    'attendance:read',
  ],
};

export class RbacService {
  public static hasPermission(role: string, customPermissions: string[], requiredPermission: string): boolean {
    if (role === 'school_owner') {
      return true; // Super Administrator has unconditional access
    }

    // Check custom permissions granted specifically to user
    if (customPermissions && customPermissions.includes(requiredPermission)) {
      return true;
    }

    // Check default role permissions
    const defaultPerms = ROLE_DEFAULT_PERMISSIONS[role] || [];
    return defaultPerms.includes(requiredPermission);
  }

  public static assertPermission(session: { role?: string; permissions?: string[] }, requiredPermission: string): void {
    if (!session || !session.role) {
      throw new Error('Authentication required: No active session');
    }

    const has = this.hasPermission(session.role, session.permissions || [], requiredPermission);
    if (!has) {
      throw new Error(`Forbidden: Insufficient privileges. Required permission: "${requiredPermission}"`);
    }
  }
}
