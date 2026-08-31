const express = require('express');
const { body, param } = require('express-validator');
const {
  getOfficers,
  createOfficer,
  updateOfficer,
  deleteOfficer,
} = require('../controllers/officerController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all officer endpoints require a valid JWT

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

// GET /api/officers
router.get('/', getOfficers);

// POST /api/officers
router.post('/', officerBodyRules, handleValidationErrors, createOfficer);

// PUT /api/officers/:id
router.put(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid officer id'), ...officerBodyRules],
  handleValidationErrors,
  updateOfficer
);

// DELETE /api/officers/:id
router.delete('/:id', param('id').isMongoId().withMessage('Invalid officer id'), handleValidationErrors, deleteOfficer);

module.exports = router;