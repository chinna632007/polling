const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getOfficers,
  getOfficersGrouped,
  createOfficer,
  updateOfficer,
  deleteOfficer,
  deleteAllOfficers,
} = require('../controllers/officerController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../services/roleService');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all officer endpoints require a valid JWT

// Roles that may create/edit officer records.
const MANAGER = [ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER];
// Only the Super Admin may delete master data.
const EXECUTIVE = [ROLES.SUPER_ADMIN];

const officerBodyRules = [
  body('officerId').trim().notEmpty().withMessage('Officer ID is required'),
  body('officerName').trim().notEmpty().withMessage('Officer Name is required'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('mobileNumber')
    .trim()
    .notEmpty()
    .withMessage('Mobile Number is required')
    .matches(/^[0-9+\-\s]{10,15}$/)
    .withMessage('Invalid mobile number'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Invalid email'),
  body('pinCode')
    .optional({ values: 'falsy' })
    .matches(/^\d{6}$/)
    .withMessage('PIN Code must be 6 digits'),
  body('mandal').trim().notEmpty().withMessage('Mandal is required'),
];

// GET /api/officers/grouped - officers grouped per Mandal (separate sections)
router.get('/grouped', getOfficersGrouped);

// GET /api/officers
router.get('/', getOfficers);

// POST /api/officers - create officer (Super Admin / Allocation Officer only)
router.post('/', officerBodyRules, handleValidationErrors, authorize(...MANAGER), createOfficer);

/**
 * DELETE /api/officers/all[?mandal=X] - Super Admin only.
 * Deletes EVERY officer (optionally only one Mandal's uploaded file data)
 * together with their allocations, notifications and cleared upload records.
 * Declared BEFORE '/:id' so "all" is never treated as an officer id.
 */
router.delete(
  '/all',
  [query('mandal').optional({ checkFalsy: true }).isString().trim()],
  handleValidationErrors,
  authorize(...EXECUTIVE),
  deleteAllOfficers
);

// PUT /api/officers/:id - update officer (Super Admin / Allocation Officer only)
router.put(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid officer id'), ...officerBodyRules],
  handleValidationErrors,
  authorize(...MANAGER),
  updateOfficer
);

// DELETE /api/officers/:id - Super Admin only
router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid officer id'),
  handleValidationErrors,
  authorize(...EXECUTIVE),
  deleteOfficer
);

module.exports = router;