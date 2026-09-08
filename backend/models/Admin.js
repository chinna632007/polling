const mongoose = require('mongoose');

/** Every role the system supports. */
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ALLOCATION_OFFICER: 'ALLOCATION_OFFICER',
  MANDAL_OFFICER: 'MANDAL_OFFICER',
  BOOTH_OFFICER: 'BOOTH_OFFICER',
};

const ROLE_LIST = Object.values(ROLES);

/**
 * User account used to log into the system.
 *
 * Role-based access control:
 *   - SUPER_ADMIN        -> full access (all mandals, user management, uploads, deletes)
 *   - ALLOCATION_OFFICER -> runs allocation, can edit data, CANNOT delete/upload/manage users
 *   - MANDAL_OFFICER     -> read-only, data ALWAYS filtered to assignedMandal (server-side)
 *   - BOOTH_OFFICER      -> sees only their own profile + allocated booth
 *
 * Passwords are always stored as bcrypt hashes - never in plain text.
 */
const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
      maxlength: [60, 'Name is too long (max 60 characters)'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never return the hash in queries by default
    },
    role: {
      type: String,
      enum: ROLE_LIST,
      default: ROLES.SUPER_ADMIN, // pre-existing accounts keep full access
    },
    // Jurisdiction scoping ---------------------------------------------------
    district: { type: String, trim: true, default: '' },
    constituency: { type: String, trim: true, default: '' },
    // For MANDAL_OFFICER: the ONLY mandal this user may see/query.
    assignedMandal: { type: String, trim: true, default: '' },
    // For BOOTH_OFFICER: a free-text label of their own booth.
    assignedBooth: { type: String, trim: true, default: '' },
    // For BOOTH_OFFICER: links this account to an Officer record (officerId).
    assignedOfficerId: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

/**
 * Compares a plain-text password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
adminSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(candidatePassword, this.password);
};

// Indexes for role-based queries and mandal-scoped lookups.
adminSchema.index({ role: 1 });
adminSchema.index({ assignedMandal: 1 });

const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

module.exports = Admin;
module.exports.ROLES = ROLES;
module.exports.ROLE_LIST = ROLE_LIST;