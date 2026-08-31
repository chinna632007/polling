const express = require('express');
const { param } = require('express-validator');
const {
  runAllocation,
  getAllocations,
  updateAllocation,
  approveAllocation,
  reallocateAllocation,
  cancelAllocationAction,
  getDashboardStats,
} = require('../controllers/allocationController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all allocation endpoints require a valid JWT

// POST /api/allocation/run
router.post('/run', runAllocation);

// GET /api/allocation
router.get('/', getAllocations);

// PUT /api/allocation/:id
router.put(
  '/:id',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  updateAllocation
);

// POST /api/allocation/:id/approve
router.post(
  '/:id/approve',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  approveAllocation
);

// POST /api/allocation/:id/reallocate
router.post(
  '/:id/reallocate',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  reallocateAllocation
);

// POST /api/allocation/:id/cancel
router.post(
  '/:id/cancel',
  param('id').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  cancelAllocationAction
);

module.exports = { router, getDashboardStats };