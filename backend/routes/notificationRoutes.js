const express = require('express');
const { param } = require('express-validator');
const {
  sendAllocationNotification,
  getNotifications,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all notification endpoints require a valid JWT

// POST /api/notifications/send/:allocationId
router.post(
  '/send/:allocationId',
  param('allocationId').isMongoId().withMessage('Invalid allocation id'),
  handleValidationErrors,
  sendAllocationNotification
);

// GET /api/notifications
router.get('/', getNotifications);

module.exports = router;