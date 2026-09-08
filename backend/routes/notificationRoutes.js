const express = require('express');
const { param } = require('express-validator');
const {
  sendAllocationNotification,
  getNotifications,
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../services/roleService');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all notification endpoints require a valid JWT

// POST /api/notifications/send/:allocationId
// Only Super Admin / Allocation Officer can send SMS notifications.
router.post(
  '/send/:allocationId',
  param('allocationId').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  authorize(ROLES.SUPER_ADMIN, ROLES.ALLOCATION_OFFICER),
  sendAllocationNotification
);

// GET /api/notifications (server-scoped for Mandal Officers)
router.get('/', getNotifications);

module.exports = router;