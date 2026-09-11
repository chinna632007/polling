/**
 * roles.js
 * ========
 * Single-login system: the ONLY role is the Main Admin (SUPER_ADMIN).
 * Kept helpers so existing imports keep working.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Main Admin',
};

export const ROLE_HOME = {
  [ROLES.SUPER_ADMIN]: '/dashboard',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Main Admin';
}

export function homeForRole() {
  return '/dashboard';
}

/** The Main Admin may do everything. */
export function canManageData() {
  return true;
}

/** True for the Main Admin. */
export function isSuperAdmin() {
  return true;
}

/** No view-only roles remain. */
export function isViewOnly() {
  return false;
}