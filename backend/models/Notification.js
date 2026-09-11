const mongoose = require('mongoose');

const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'];

/**
 * Persists every SMS that the system attempts to send, together with its
 * current delivery status, so administrators can audit who was informed.
 */
const notificationSchema = new mongoose.Schema(
  {
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'Officer', required: true },
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation' },
    mobileNumber: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'PENDING',
    },
    providerMessageId: { type: String },
    provider: { type: String, default: 'mock' },
    error: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1 });
notificationSchema.index({ officer: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);