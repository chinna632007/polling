const express = require('express');
const { param } = require('express-validator');
const {
  runAllocation,
  getAllocations,
  getAllocationMandals,
  getSuitableBooths,
  reallocateAllocation,
  cancelAllocationAction,
  getDashboardStats,
  deleteAllAllocations,
  deleteAllocationsByMandal,
} = require('../controllers/allocationController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // every allocation endpoint requires a valid JWT

// POST /api/allocation/run - run the automatic allocation algorithm
router.post('/run', runAllocation);

// GET /api/allocation/mandals - per-Mandal overview
router.get('/mandals', getAllocationMandals);

// GET /api/allocation - list allocations (all statuses), populated
router.get('/', getAllocations);

// GET /api/allocation/suitable-booths/:officerId (also mounted at /api/allocations)
router.get('/suitable-booths/:officerId', getSuitableBooths);

// DELETE /api/allocation/all - wipe every allocation + resync counters
router.delete('/all', deleteAllAllocations);

// DELETE /api/allocation/mandal/:name - wipe one Mandal's allocations
router.delete(
  '/mandal/:name',
  [param('name').isString().trim().notEmpty().withMessage('Mandal name is required')],
  handleValidationErrors,
  deleteAllocationsByMandal
);

// POST /api/allocation/:id/reallocate
router.post(
  '/:id/reallocate',
  [param('id').isMongoId().withMessage('Invalid allocation id')],
  handleValidationErrors,
  reallocateAllocation
);

// POST /api/allocation/:id/cancel
router.post(
  '/:id/cancel',
  [param('id').isMongoId().withMessage('Invalid allocation id')],
  handleValidationErrors,
  cancelAllocationAction
);

module.exports = { router, getDashboardStats };
