const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

/** Public shape of an admin document (never exposes the password hash). */
function sanitizeAdmin(admin) {
  return {
    id: admin._id,
    username: admin.username,
    name: admin.name || '',
  };
}

/** Builds a signed JWT for the given admin document. */
function signToken(admin) {
  return jwt.sign({ id: admin._id, username: admin.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

/**
 * POST /api/auth/login
 * Verifies admin credentials and returns a signed JWT.
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username: String(username).toLowerCase() }).select(
      '+password'
    );
        if (!admin || !(await admin.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid username or password' });
    }

    return res.json({ success: true, token: signToken(admin), admin: sanitizeAdmin(admin) });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/me - returns the currently logged-in admin (requires valid token). */
async function me(req, res) {
  return res.json({ success: true, admin: req.admin });
}

/**
 * GET /api/auth/boot/status
 * Public endpoint that reports whether the system is in bootstrap mode
 * (i.e. no admin accounts exist yet in the DB). The frontend uses this to
 * decide whether to show the "Create First Admin Account" flow.
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
 * Creates the very first administrator account when the DB has zero admins.
 * Returns a signed JWT so the newly created admin is logged in immediately.
 * After the first admin exists, this route is automatically disabled.
 */
async function boot(req, res, next) {
  try {
    const { name = '', username, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Passwords do not match' });
    }

    // Re-check at creation time: if an admin already exists, refuse.
    const existing = await Admin.findOne({});
    if (existing) {
      return res.status(403).json({
        success: false,
        message: 'Bootstrap is closed: an administrator account already exists. Log in instead.',
      });
    }

    const normalized = String(username).trim().toLowerCase();
    const admin = await Admin.create({
      name: String(name || '').trim(),
      username: normalized,
      password: await bcrypt.hash(password, 10),
    });

    return res.status(201).json({
      success: true,
      token: signToken(admin),
      message: `First admin account '${admin.username}' created successfully`,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/register   (ADMIN-ONLY)
 * Creates a new administrator account. The route is protected, so only a
 * signed-in administrator can register further admins - outsiders can never
 * self-register.
 */
async function register(req, res, next) {
  try {
    const { name = '', username, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'Passwords do not match' });
    }

    const normalized = String(username).trim().toLowerCase();
    const exists = await Admin.findOne({ username: normalized });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: `Username '${normalized}' is already taken` });
    }

    const admin = await Admin.create({
      name: String(name || '').trim(),
      username: normalized,
      password: await bcrypt.hash(password, 10),
    });

    return res.status(201).json({
      success: true,
      message: `Admin account '${admin.username}' created successfully`,
      data: sanitizeAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/admins - lists every admin account (never the password hash). */
async function listAdmins(req, res, next) {
  try {
    const admins = await Admin.find().sort({ createdAt: 1 }).lean();
    return res.json({
      success: true,
      data: admins.map((a) => ({
        id: a._id,
        username: a.username,
        name: a.name || '',
        createdAt: a.createdAt,
        isSelf: String(a._id) === String(req.admin._id),
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/auth/admins/:id
 * Removes an admin account. Guards: you cannot delete the account you are
 * signed in with, and the system must always keep at least one administrator.
 * Deleted admins are signed out automatically (protect() re-checks the DB).
 */
async function deleteAdmin(req, res, next) {
  try {
    const targetId = String(req.params.id);

    if (targetId === String(req.admin._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete the account you are signed in with',
      });
    }

    const total = await Admin.countDocuments();
    if (total <= 1) {
      return res.status(400).json({
        success: false,
        message: 'At least one administrator account must remain',
      });
    }

    const deleted = await Admin.findByIdAndDelete(targetId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    return res.json({ success: true, message: `Admin '${deleted.username}' removed` });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, me, register, listAdmins, deleteAdmin, boot, bootStatus };