const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const roleService = require('../services/roleService');
const { ROLES, sanitizeUser } = roleService;

/** Builds a signed JWT for the given user (role included for fast checks). */
function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

/** Normalizes the login identifier (username or email). */
function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * POST /api/auth/login
 * Verifies credentials by username OR email and returns a signed JWT plus the
 * sanitized user (role, assignedMandal, ...) so the frontend can redirect and
 * scope the UI accordingly.
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Username/Email and password are required' });
    }

    const identifier = normalizeLogin(username);
    const user = await Admin.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid username/email or password' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated - contact your administrator',
      });
    }

    return res.json({ success: true, token: signToken(user), user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/me - returns the currently logged-in user. */
async function me(req, res) {
  return res.json({ success: true, user: req.user });
}

/**
 * GET /api/auth/my-dashboard
 * Personal dashboard payload for limited roles. For a BOOTH_OFFICER this
 * returns their linked officer profile + active allocation + booth. Mandal
 * Officers use the (server-scoped) regular stats endpoints instead.
 */
async function myDashboard(req, res, next) {
  try {
    const user = req.user;
    const result = { user, officer: null, allocation: null, booth: null };

    if (user.role === ROLES.BOOTH_OFFICER) {
      const Officer = require('../models/Officer');
      const Allocation = require('../models/Allocation');

      // Link: prefer the explicit assignedOfficerId, else the username, which
      // matches officerId by convention (e.g. officer001 -> OFFICER001).
      const officerId =
        (user.assignedOfficerId || '').trim() ||
        String(user.username || '').toUpperCase().trim();
      if (officerId) {
        result.officer = await Officer.findOne({ officerId }).lean();
      }

      if (result.officer) {
        const allocation = await Allocation.findOne({
          officer: result.officer._id,
          status: { $ne: 'Cancelled' },
        })
          .populate('officer')
          .populate('booth')
          .lean();
        result.allocation = allocation || null;
        result.booth = allocation?.booth || null;
      }
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/boot/status
 * Public - reports whether the system is in bootstrap mode (no users yet).
 */
async function bootStatus(req, res, next) {
  try {
    const count = await Admin.countDocuments();
    return res.json({ success: true, bootstrapMode: count === 0 });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/boot  (one-time bootstrap, public)
 * Creates the very first SUPER_ADMIN account when the DB has zero users.
 */
async function boot(req, res, next) {
  try {
    const { name = '', username, email = '', password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const existing = await Admin.findOne({});
    if (existing) {
      return res.status(403).json({
        success: false,
        message: 'Bootstrap is closed: an administrator account already exists. Log in instead.',
      });
    }

    const normalized = String(username).trim().toLowerCase();
    const user = await Admin.create({
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      username: normalized,
      password: await bcrypt.hash(password, 10),
      role: ROLES.SUPER_ADMIN,
      status: 'active',
    });

    return res.status(201).json({
      success: true,
      token: signToken(user),
      message: `Super Admin account '${user.username}' created successfully`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/register - SUPER_ADMIN ONLY
 * Creates a new user with role + jurisdiction (assignedMandal etc.).
 */
async function register(req, res, next) {
  try {
    const {
      name = '',
      username,
      email = '',
      password,
      confirmPassword,
      role = ROLES.SUPER_ADMIN,
      district = '',
      constituency = '',
      assignedMandal = '',
      assignedBooth = '',
      assignedOfficerId = '',
      status = 'active',
    } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const normalized = String(username).trim().toLowerCase();
    const exists = await Admin.findOne({ username: normalized });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `Username '${normalized}' is already taken`,
      });
    }
    if (email && (await Admin.findOne({ email: String(email).trim().toLowerCase() }))) {
      return res
        .status(409)
        .json({ success: false, message: `Email '${email}' is already in use` });
    }

    const user = await Admin.create({
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      username: normalized,
      password: await bcrypt.hash(password, 10),
      role,
      district: String(district || '').trim(),
      constituency: String(constituency || '').trim(),
      assignedMandal: String(assignedMandal || '').trim(),
      assignedBooth: String(assignedBooth || '').trim(),
      assignedOfficerId: String(assignedOfficerId || '').trim(),
      status,
    });

    return res.status(201).json({
      success: true,
      message: `User '${user.username}' created with role ${role}`,
      data: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/users - lists every user (never the password hash). */
async function listUsers(req, res, next) {
  try {
    const users = await Admin.find().sort({ createdAt: 1 }).lean();
    return res.json({
      success: true,
      data: users.map((u) => ({
        ...sanitizeUser(u),
        isSelf: String(u._id) === String(req.user.id),
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/auth/users/:id - SUPER_ADMIN ONLY
 * Updates a user's profile, role, jurisdiction, status and optionally resets
 * the password. The last SUPER_ADMIN can never be demoted or deactivated.
 */
async function updateUser(req, res, next) {
  try {
    const targetId = String(req.params.id);
    const target = await Admin.findById(targetId).select('+password');
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const patch = {};
    const assign = (field) => {
      if (req.body[field] !== undefined) patch[field] = String(req.body[field]).trim();
    };
    assign('name');
    assign('email');
    assign('district');
    assign('constituency');
    assign('assignedMandal');
    assign('assignedBooth');
    assign('assignedOfficerId');
    if (req.body.role !== undefined) patch.role = req.body.role;
    if (req.body.status !== undefined) patch.status = req.body.status;

    // Guard: the last SUPER_ADMIN cannot lose their role or be deactivated.
    const targetIsSuper = target.role === ROLES.SUPER_ADMIN;
    const demoting = patch.role && patch.role !== ROLES.SUPER_ADMIN;
    const deactivating = patch.status === 'inactive';
    if (targetIsSuper && (demoting || deactivating)) {
      const superCount = await Admin.countDocuments({ role: ROLES.SUPER_ADMIN });
      if (superCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'The last Super Admin cannot be demoted or deactivated',
        });
      }
    }

    // Optional password reset:
    if (req.body.newPassword) {
      if (req.body.newPassword !== req.body.confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match' });
      }
      if (String(req.body.newPassword).length < 8) {
        return res
          .status(400)
          .json({ success: false, message: 'Password must be at least 8 characters' });
      }
      target.password = await bcrypt.hash(req.body.newPassword, 10);
    }

    Object.assign(target, patch);
    await target.save();

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: sanitizeUser(target),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/auth/users/:id - SUPER_ADMIN ONLY
 * Removes a user. Guards: you cannot delete yourself, and at least one
 * SUPER_ADMIN must always remain. Deleted users are signed out immediately
 * because protect() re-checks the DB on every request.
 */
async function deleteUser(req, res, next) {
  try {
    const targetId = String(req.params.id);
    if (targetId === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete the account you are signed in with',
      });
    }

    const target = await Admin.findById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.role === ROLES.SUPER_ADMIN) {
      const superCount = await Admin.countDocuments({ role: ROLES.SUPER_ADMIN });
      if (superCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'At least one Super Admin account must remain',
        });
      }
    }

    const deleted = await Admin.findByIdAndDelete(targetId);
    return res.json({ success: true, message: `User '${deleted.username}' removed` });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me,
  myDashboard,
  register,
  listUsers,
  updateUser,
  deleteUser,
  boot,
  bootStatus,
  // Backward-compatible aliases used by older pages:
  listAdmins: listUsers,
  deleteAdmin: deleteUser,
};