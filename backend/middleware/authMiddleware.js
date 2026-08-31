const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

/** Express error returned for missing/invalid tokens - matches errorMiddleware. */
function unauthorized(res, message) {
  return res.status(401).json({ success: false, message });
}

/**
 * Protects every admin route. Verifies the Bearer JWT and attaches the
 * admin document to req.admin.
 */
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return unauthorized(res, 'Not authorized - missing token');
    }
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select('-password').lean();
    if (!admin) {
      return unauthorized(res, 'Not authorized - admin no longer exists');
    }
    req.admin = admin;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return unauthorized(res, 'Session expired - please log in again');
    }
    return unauthorized(res, 'Not authorized - invalid token');
  }
}

module.exports = { protect, unauthorized };