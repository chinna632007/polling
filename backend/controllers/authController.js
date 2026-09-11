const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const roleService = require('../services/roleService');
const { sanitizeUser } = roleService;

/** Builds a signed JWT for the Main Admin. */
function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * POST /api/auth/login
 * The ONLY login in the system: the Main Admin.
 * Username is enough - officers and mandals do not log in.
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Username and password are required' });
    }

    const identifier = normalizeLogin(username);
    const user = await Admin.findOne({ username: identifier }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
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

/** GET /api/auth/me - returns the currently logged-in Main Admin. */
async function me(req, res) {
  return res.json({ success: true, user: req.user });
}

module.exports = { login, me };
