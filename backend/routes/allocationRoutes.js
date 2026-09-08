const express = require('express');
const { param, query } = require('express-validator');
const {
  runAllocation,
  getAllocations,
  getAllocationMandals,
  updateAllocation,
  approveAllocation,
  reallocateAllocation,
  cancelAllocationAction,
  getDashboardStats,
  deleteAllAllocations,
  deleteAllocationsByMandal,
} = require('../controllers/allocationController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../services/roleService');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all allocation endpoints require a valid JWT

// Roles that may run allocation + manage allocation records.
const MANAGER = [ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER];
// Only the Super Admin may wipe allocations.
const EXECUTIVE = [ROLES.SUPER_ADMIN];

// POST /api/allocation/run[?mandal=X] - mandal-scoped or full run
router.post(
  '/run',
  [query('mandal').optional({ checkFalsy: true }).isString().trim()],
  handleValidationErrors,
  authorize(...MANAGER),
  runAllocation
);

// GET /api/allocation/mandals - per-Mandal overview (server-scoped)
router.get('/mandals', getAllocationMandals);

// GET /api/allocation
router.get('/', getAllocations);

/**
 * DELETE /api/allocation/all - wipe every allocation (Super Admin only).
 * Declared BEFORE '/:id' so "all" is never treated as an allocation id.
 */
router.delete('/all', authorize(...EXECUTIVE), deleteAllAllocations);

/**
 * DELETE /api/allocation/mandal/:name - wipe one Mandal's allocations (Super Admin only).
 */
router.delete(
  '/mandal/:name',
  [param('name').isString().trim().notEmpty().withMessage('Mandal name is required')],
  handleValidationErrors,
  authorize(...EXECUTIVE),
  deleteAllocationsByMandal
);

// PUT /api/allocation/:id
router.put(
  '/:id',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(...MANAGER),
  updateAllocation
);

// POST /api/allocation/:id/approve
router.post(
  '/:id/approve',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(...MANAGER),
  approveAllocation
);

// POST /api/allocation/:id/reallocate
router.post(
  '/:id/reallocate',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(...MANAGER),
  reallocateAllocation
);

// POST /api/allocation/:id/cancel
router.post(
  '/:id/cancel',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(...MANAGER),
  cancelAllocationAction
);

module.exports = { router, getDashboardStats };