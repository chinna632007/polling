const mongoose = require('mongoose');

const ALLOCATION_STATUSES = ['Allocated', 'Pending Approval', 'Unallocated', 'Cancelled'];

/**
 * Links one officer to one booth.
 * Enforcement rules:
 *  - One officer can only ever have ONE active (not cancelled) allocation.
 *  - Statuses: Allocated | Pending Approval | Unallocated | Cancelled
 */
const allocationSchema = new mongoose.Schema(
  {
    allocationId: {
      type: String,
      required: true,
      unique: true, // deterministic: ALLOC-YYYYMMDD-<officerId>
      trim: true,
    },
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'Officer', required: true },
    booth: { type: mongoose.Schema.Types.ObjectId, ref: 'Booth' }, // null when Unallocated
    mandal: { type: String, trim: true },
    status: {
      type: String,
      enum: ALLOCATION_STATUSES,
      default: 'Pending Approval',
    },
    allocationDate: { type: Date, default: Date.now },
    // 0-100 score from addressMatchingService; 0 = no conflict found (safe)
    addressMatchScore: { type: Number, default: 0, min: 0, max: 100 },
    // Set when the address comparison produced related tokens (used for audit/UI highlight)
    rejectedReasons: { type: [String], default: [] },
    adminApproved: { type: Boolean, default: false },
    approvedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// Each officer may hold only ONE active allocation (rules: one officer = one allocation).
// MongoDB enforces this at the database level as well.
allocationSchema.index(
  { officer: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'Cancelled' } },
  }
);
allocationSchema.index({ status: 1 });
allocationSchema.index({ mandal: 1 });

module.exports =
  mongoose.models.Allocation || mongoose.model('Allocation', allocationSchema);