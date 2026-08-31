const express = require('express');
const { body, param } = require('express-validator');
const {
  login,
  me,
  register,
  listAdmins,
  deleteAdmin,
  boot,
  bootStatus,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();

// -------------------------------------------------------------------
// Public routes (no authentication required)
// -------------------------------------------------------------------
// POST /api/auth/login (always public)
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
);

// GET /api/auth/boot/status - reports whether bootstrap (create-first-admin) mode is active
router.get('/boot/status', bootStatus);

// POST /api/auth/boot - one-time, public route to create the first admin.
// The controller itself re-checks the DB on every call, so it's always safe:
//    - 201 created + token   when zero admins exist
//    - 403 forbidden         once an admin already exists
router.post(
  '/boot',
  [
    body('username')
      .trim()
      .isLowercase()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage(
        'Username must be 3-30 lowercase letters, numbers, dot, underscore or hyphen'
      ),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
  ],
  handleValidationErrors,
  boot
);

// GET /api/auth/me - current session info (requires valid token)
router.get('/me', protect, me);

// -------------------------------------------------------------------
// Protected routes (signed-in administrator required)
// -------------------------------------------------------------------
router.use(protect);

// POST /api/auth/register - ADMIN-ONLY creation of further admin accounts
router.post(
  '/register',
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .matches(/^[a-zA-Z0-9._-]{3,30}$/)
      .withMessage(
        'Username must be 3-30 characters (letters, numbers, dot, underscore, hyphen only)'
      ),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
    body('name')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 60 })
      .withMessage('Name is too long (max 60 characters)'),
  ],
  handleValidationErrors,
  register
);

// GET /api/auth/admins - list all admin accounts
router.get('/admins', listAdmins);

// DELETE /api/auth/admins/:id - remove an admin account (guarded)
router.delete(
  '/admins/:id',
  param('id').isMongoId().withMessage('Invalid admin id'),
  handleValidationErrors,
  deleteAdmin
);

module.exports = router;