const mongoose = require('mongoose');

/**
 * Election / Government officer who is available for polling duty.
 * The address is stored in structured fields so the allocation engine
 * can compare it with booth addresses in a meaningful way.
 */
const officerSchema = new mongoose.Schema(
  {
    officerId: {
      type: String,
      required: [true, 'Officer ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    officerName: {
      type: String,
      required: [true, 'Officer Name is required'],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile Number is required'],
      trim: true,
      match: [/^[0-9+\-\s]{10,15}$/, 'Invalid mobile number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    // --- Structured residential address fields ---
    houseNumber: { type: String, trim: true, default: '' },
    street: { type: String, trim: true, default: '' },
    locality: { type: String, trim: true, default: '' }, // village / locality
    ward: { type: String, trim: true, default: '' },
    mandal: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    pinCode: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Query performance index for grouping/filtering by Mandal and Locality
// (the officerId unique index is created automatically by unique: true above)
officerSchema.index({ mandal: 1 });
officerSchema.index({ locality: 1 });

module.exports = mongoose.models.Officer || mongoose.model('Officer', officerSchema);