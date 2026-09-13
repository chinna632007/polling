const express = require('express');
const { param } = require('express-validator');
const {
  runAllocation,
  getAllocations,
  getAllocationMandals,
  getSuitableBooths,
  manualAllocateAction,
  reallocateAllocation,
  cancelAllocationAction,
  getOverAllocatedBooths,
  repairOverAllocatedBooths,
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

// POST /api/allocation/manual - admin manually assigns an officer to a booth
// (full capacity validation happens in the backend, never only in the UI)
router.post('/manual', manualAllocateAction);

// GET /api/allocation/over-allocated - data-safety report (over-filled booths)
router.get('/over-allocated', getOverAllocatedBooths);

// POST /api/allocation/over-allocated/repair - safe correction process
// (keeps the earliest valid allocations, marks excess ones for review)
router.post('/over-allocated/repair', repairOverAllocatedBooths);

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
