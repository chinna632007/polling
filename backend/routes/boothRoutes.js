const express = require('express');
const { body, param } = require('express-validator');
const { getBooths, createBooth, updateBooth, deleteBooth } = require('../controllers/boothController');
const { protect } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect); // all booth endpoints require a valid JWT

const boothBodyRules = [
  body('boothId').trim().notEmpty().withMessage('Booth ID is required'),
  body('boothNumber').trim().notEmpty().withMessage('Booth Number is required'),
  body('boothName').trim().notEmpty().withMessage('Booth Name is required'),
  body('pinCode')
    .optional({ values: 'falsy' })
    .matches(/^\d{6}$/)
    .withMessage('PIN Code must be 6 digits'),
  body('requiredOfficers')
    .isInt({ min: 0 })
    .withMessage('Required Officers must be a non-negative integer'),
  body('mandal').trim().notEmpty().withMessage('Mandal is required'),
];

// GET /api/booths
router.get('/', getBooths);

// POST /api/booths
router.post('/', boothBodyRules, handleValidationErrors, createBooth);

// PUT /api/booths/:id
router.put(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid booth id'), ...boothBodyRules],
  handleValidationErrors,
  updateBooth
);

// DELETE /api/booths/:id
router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid booth id'),
  handleValidationErrors,
  deleteBooth
);

module.exports = router;