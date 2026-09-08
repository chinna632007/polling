/**
 * roles.js
 * ========
 * Frontend role constants + helpers. Mirrors backend/services/roleService.js.
 * The SERVER is always the source of truth for access control - these helpers
 * only drive the UI (menus, redirects, hiding buttons) and never replace the
 * backend checks.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ALLOCATION_OFFICER: 'ALLOCATION_OFFICER',
  MANDAL_OFFICER: 'MANDAL_OFFICER',
  BOOTH_OFFICER: 'BOOTH_OFFICER',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ALLOCATION_OFFICER]: 'Allocation Officer',
  [ROLES.MANDAL_OFFICER]: 'Mandal Officer',
  [ROLES.BOOTH_OFFICER]: 'Booth Officer',
};

/** Default landing page for each role (used right after login). */
export const ROLE_HOME = {
  [ROLES.SUPER_ADMIN]: '/admin/dashboard',
  [ROLES.ALLOCATION_OFFICER]: '/allocation/dashboard',
  [ROLES.MANDAL_OFFICER]: '/mandal/dashboard',
  [ROLES.BOOTH_OFFICER]: '/officer/dashboard',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '—';
}

export function homeForRole(role) {
  // SECURITY/UX: this must NEVER return "/" — the "/" route renders a redirect
  // to the role home, so returning "/" from here would create an infinite
  // redirect loop and show a blank white page. Unknown/missing roles fall back
  // to the Super Admin home (backend sanitizeUser does the same default).
  return ROLE_HOME[role] || ROLE_HOME[ROLES.SUPER_ADMIN];
}

/** True for roles that may edit master data + run/manage allocations. */
export function canManageData(user) {
  return Boolean(
    user && (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ALLOCATION_OFFICER)
  );
}

/** True only for the Super Admin (uploads, deletes, user management). */
export function isSuperAdmin(user) {
  return Boolean(user && user.role === ROLES.SUPER_ADMIN);
}

/** Role bits for view-only access (Mandal/Booth officers). */
export function isViewOnly(user) {
  return Boolean(
    user &&
      (user.role === ROLES.MANDAL_OFFICER || user.role === ROLES.BOOTH_OFFICER)
  );
}