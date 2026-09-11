const express = require('express');
const { body } = require('express-validator');
const { login, me } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();

// POST /api/auth/login - Main Admin login (public)
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
);

// GET /api/auth/me - current session info (protected)
router.get('/me', protect, me);

// There is intentionally NO /register, NO /boot and NO user-management route.
// The Main Admin is created automatically on server start (see server.js).

module.exports = router;
