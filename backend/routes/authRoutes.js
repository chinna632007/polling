const express = require('express');
const { body, param } = require('express-validator');
const {
  login,
  me,
  myDashboard,
  register,
  listUsers,
  updateUser,
  deleteUser,
  boot,
  bootStatus,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../services/roleService');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();

const USER_ROLES = Object.values(ROLES);

/** Shared validation for the role/username/password fields. */
const createUserRules = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .matches(/^[a-zA-Z0-9._-]{3,30}$/)
    .withMessage('Username must be 3-30 characters (letters, numbers, dot, underscore, hyphen only)'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
  body('role')
    .isIn(USER_ROLES)
    .withMessage(`Role must be one of: ${USER_ROLES.join(', ')}`),
  body('status').optional({ values: 'falsy' }).isIn(['active', 'inactive']),
  body('name').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
];

// -------------------------------------------------------------------
// Public routes (no authentication required)
// -------------------------------------------------------------------
// POST /api/auth/login (always public)
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username or email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
);

// GET /api/auth/boot/status - reports whether bootstrap (create-first-admin) mode is active
router.get('/boot/status', bootStatus);

// POST /api/auth/boot - one-time, public route to create the first SUPER_ADMIN.
router.post(
  '/boot',
  [
    body('username')
      .trim()
      .isLowercase()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('Username must be 3-30 lowercase letters, numbers, dot, underscore or hyphen'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Invalid email address'),
  ],
  handleValidationErrors,
  boot
);

// -------------------------------------------------------------------
// Signed-in routes (valid JWT required)
// -------------------------------------------------------------------
router.use(protect);

// GET /api/auth/me - current session info
router.get('/me', me);

// GET /api/auth/my-dashboard - personal dashboard for limited roles
router.get('/my-dashboard', myDashboard);

// -------------------------------------------------------------------
// Super Admin only: user management
// -------------------------------------------------------------------
// POST /api/auth/register - create a user with any role
router.post('/register', createUserRules, handleValidationErrors, authorize(ROLES.SUPER_ADMIN), register);

// GET /api/auth/users - list all users
router.get('/users', authorize(ROLES.SUPER_ADMIN), listUsers);

// PUT /api/auth/users/:id - edit user (role, jurisdiction, password reset)
router.put(
  '/users/:id',
  [
    param('id').isMongoId().withMessage('Invalid user id'),
    body('role').optional({ values: 'falsy' }).isIn(USER_ROLES),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Invalid email'),
    body('newPassword')
      .optional({ values: 'falsy' })
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirmPassword')
      .optional({ values: 'falsy' })
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('New passwords do not match'),
  ],
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN),
  updateUser
);

// DELETE /api/auth/users/:id - remove a user
router.delete(
  '/users/:id',
  param('id').isMongoId().withMessage('Invalid user id'),
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN),
  deleteUser
);

// Backward-compatible aliases (/admins) for any older client:
router.get('/admins', authorize(ROLES.SUPER_ADMIN), listUsers);
router.delete(
  '/admins/:id',
  param('id').isMongoId().withMessage('Invalid user id'),
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN),
  deleteUser
);

module.exports = router;