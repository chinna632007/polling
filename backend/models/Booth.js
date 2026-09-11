const mongoose = require('mongoose');

/**
 * A polling booth inside a Mandal.
 *
 * allocatedOfficerCount is maintained by the allocation service (and by
 * countService.recalculateBoothAllocationCount) so every request can quickly
 * see remaining capacity = requiredOfficers - allocatedOfficerCount..
 *
 * availableSlots is a derived field kept in sync: requiredOfficers - allocatedOfficerCount..
 */
const boothSchema = new mongoose.Schema(
  {
    boothId: {
      type: String,
      required: [true,'Booth ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    boothNumber: {
      type: String,
      required: [true,'Booth Number is required'],
      trim: true,
    },
    boothName: {
      type: String,
      required: [true,'Booth Name is required'],
      trim: true,
    },
    // --- Structured booth address fields ---
    buildingName: { type: String, trim: true, default: '' },
    street: { type: String, trim: true, default: '' },
    locality: { type: String, trim: true, default: '' }, // village / locality
    ward: { type: String, trim: true, default: '' },
    // Mandal binding: prefer `mandalId` (ObjectId ref); `mandal` is kept in sync
    mandalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mandal', default: null },
    mandal: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    pinCode: { type: String, trim: true, default: '' },
    requiredOfficers: {
      type: Number,
      required: [true,'Required Officers is required'],
      min: [0,'Required Officers cannot be negative'],
      default: 1,
    },
    allocatedOfficerCount: {
      type: Number,
      default: 0,
      min: [0,'Allocated count cannot be negative'],
    },
    availableSlots: {
      type: Number,
      default: 0,
      min: [0,'Available slots cannot be negative'],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Keep capacity fields consistent before validation.

boothSchema.pre('validate', function ensureCapacityConsistency() {
  this.availableSlots = Math.max(0, (this.requiredOfficers || 0) - (this.allocatedOfficerCount || 0));
  if (this.allocatedOfficerCount > this.requiredOfficers) {

    this.invalidate('allocatedOfficerCount', 'Allocated count cannot exceed required officers');
  }
});

boothSchema.index({ mandalId: 1 });
boothSchema.index({ mandal: 1 });
boothSchema.index({ locality: 1 });
boothSchema.index({ isActive: 1 });

module.exports = mongoose.models.Booth || mongoose.model('Booth', boothSchema);