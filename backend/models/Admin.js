const mongoose = require('mongoose');

/**
 * Administrator account used to log into the system.
 * Passwords are always stored as bcrypt hashes - never in plain text.
 */
const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
      maxlength: [60, 'Name is too long (max 60 characters)'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never return the hash in queries by default
    },
  },
  { timestamps: true }
);

/**
 * Compares a plain-text password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
adminSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.Admin || mongoose.model('Admin', adminSchema);