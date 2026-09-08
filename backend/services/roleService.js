/**
 * roleService.js
 * ==============
 * Central place for everything role-based:
 *   - role constants / human-readable labels
 *   - the public (safe) shape of a user document
 *   - data-scope helpers that derive MongoDB filters from the logged-in user
 *
 * SECURITY: every controller that returns officers / booths / allocations /
 * notifications / reports MUST apply scopeFilter() BEFORE querying. A Mandal
 * Officer can then never receive data belonging to another Mandal, no matter
 * what query parameters the client sends.
 */

const ROLES = require('../models/Admin').ROLES;

const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ALLOCATION_OFFICER]: 'Allocation Officer',
  [ROLES.MANDAL_OFFICER]: 'Mandal Officer',
  [ROLES.BOOTH_OFFICER]: 'Booth Officer',
};

/** Escapes a user-provided value so it is safe inside a RegExp. */
function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive mandal equality query for the given mandal name. */
function mandalQuery(mandal) {
  const m = String(mandal || '').trim();
  if (!m) return null;
  return { $regex: new RegExp(`^${escapeRegex(m)}$`, 'i') };
}

/**
 * Derives the mandatory data-scope filter for the given user.
 * Returns null when the user has full access (SUPER_ADMIN / ALLOCATION_OFFICER).
 * For a MANDAL_OFFICER it ALWAYS forces the assigned mandal, overriding any
 * client-supplied mandal filter.
 *
 * @param {object} user - sanitized user doc attached by protect()
 */
function scopeFilter(user) {
  if (!user) return null;
  if (user.role === ROLES.MANDAL_OFFICER) {
    const mq = mandalQuery(user.assignedMandal);
    if (mq) return { mandal: mq };
    // Defensive: a Mandal Officer without an assigned mandal sees nothing.
    return { mandal: { $nin: [] } }; // matches nothing
  }
  return null;
}

/**
 * Converts the user data-scope into a Notification-collection filter.
 * Notifications reference officers by ObjectId, so we resolve the officer ids
 * that live inside the user's scope first.
 */
async function notificationScopeFilter(user) {
  const scope = scopeFilter(user);
  if (!scope) return {};
  const Officer = require('../models/Officer');
  const officerIds = await Officer.find(scope).select('_id').lean();
  if (officerIds.length === 0) return { officer: { $in: [] } }; // matches nothing
  return { officer: { $in: officerIds.map((o) => o._id) } };
}

/** Public shape of a user - never exposes password hash. */
function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    username: user.username,
    name: user.name || '',
    email: user.email || '',
    role: user.role || ROLES.SUPER_ADMIN,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    district: user.district || '',
    constituency: user.constituency || '',
    assignedMandal: user.assignedMandal || '',
    assignedBooth: user.assignedBooth || '',
    assignedOfficerId: user.assignedOfficerId || '',
    status: user.status || 'active',
    createdAt: user.createdAt,
  };
}

/** True when the role may edit master data (officers/booths) and allocations. */
function canManageData(user) {
  return Boolean(
    user &&
      (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ALLOCATION_OFFICER)
  );
}

/** True when the role may run destructive actions (deletes, user admin, uploads). */
function isSuperAdmin(user) {
  return Boolean(user && user.role === ROLES.SUPER_ADMIN);
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  escapeRegex,
  mandalQuery,
  scopeFilter,
  notificationScopeFilter,
  sanitizeUser,
  canManageData,
  isSuperAdmin,
};