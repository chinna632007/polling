/**
 * Smart Polling Booth Officer Allocation and Notification System
 * --------------------------------------------------------------
 * Entry point of the Express API. Wires up middleware, mounts every route
 * under /api, seeds the default admin, and starts the server.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const Admin = require('./models/Admin');

const authRoutes = require('./routes/authRoutes');
const officerRoutes = require('./routes/officerRoutes');
const boothRoutes = require('./routes/boothRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

const { protect } = require('./middleware/authMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// --------------------------- Global middleware ------------------------------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------- Routes --------------------------------------
app.get('/api/health', (req, res) =>
  res.json({ success: true, message: 'Smart Polling Allocation API is running' })
);

app.use('/api/auth', authRoutes);
app.use('/api/officers', officerRoutes);
app.use('/api/booths', boothRoutes);
app.use('/api/allocation', allocationRoutes.router);

// Dashboard stats endpoint (protected, lives next to allocation data).
app.get('/api/dashboard/stats', protect, allocationRoutes.getDashboardStats);

app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportsRoutes);

// Serve sample templates folder as static files (backup for template links).
app.use('/static', express.static(path.join(__dirname, 'uploads')));

// --------------------------- Error handling -----------------------------------
app.use(notFound);
app.use(errorHandler);

// ------------------------------- Bootstrap -------------------------------------
/**
 * Seeds ONLY the Main Admin account (single-login system).
 *
 * - Creates ADMIN_USERNAME / ADMIN_PASSWORD (defaults: admin / admin123)
 *   with a bcrypt hash when it does not exist.
 * - Keeps the password in sync with the env value in development so the
 *   documented login always works.
 * - Deletes any other Admin documents (old demo/test accounts) WITHOUT
 *   touching Officers, Booths, Allocations, Notifications or UploadBatches.
 * - Resyncs booth counters from real ALLOCATED allocation documents.
 */
async function seedMainAdmin() {
  const bcrypt = require('bcryptjs');
  const countService = require('./services/countService');

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const production = process.env.NODE_ENV === 'production';

  const existing = await Admin.findOne({ username }).select('+password');
  if (!existing) {
    await Admin.create({
      username,
      password: await bcrypt.hash(password, 10),
      name: 'Main Admin',
      role: 'SUPER_ADMIN',
      district: process.env.ADMIN_DISTRICT || '',
      status: 'active',
    });
    console.log(`[AUTH] Created Main Admin account '${username}'`);
  } else if (!production) {
    const ok = await existing.comparePassword(password);
    if (!ok) {
      existing.password = await bcrypt.hash(password, 10);
      await existing.save();
      console.log(`[AUTH] Synced Main Admin password for '${username}'`);
    }
  }

  // Requirement A: remove ONLY demo/test auth accounts, never domain data.
  try {
    const removed = await Admin.deleteMany({ username: { $ne: username } });
    if (removed.deletedCount > 0) {
      console.log(`[AUTH] Removed ${removed.deletedCount} non-admin demo account(s)`);
    }
  } catch (error) {
    console.warn('[AUTH] Could not clean demo accounts:', error.message);
  }

  // Requirement B: booth counters are rebuilt from allocation documents.
  try {
    const sync = await countService.resyncAllBoothCounts();
    console.log('[BOOT] Booth counters resynced from ALLOCATED allocations');
    if (sync.overAllocated && sync.overAllocated.length > 0) {
      console.warn('[BOOT] WARNING: over-allocated booths detected (required officers exceeded):');
      sync.overAllocated.forEach((b) =>
        console.warn(
          `[BOOT]   Booth ${b.boothNumber || b.boothCode}: required ${b.requiredOfficers}, ` +
            `allocated ${b.actualAllocatedOfficers}, excess ${b.excessOfficers}`
        )
      );
      console.warn(
        '[BOOT] Run GET /api/allocation/over-allocated and POST /api/allocation/over-allocated/repair to fix.'
      );
    }
  } catch (error) {
    console.warn('[BOOT] Could not resync booth counts:', error.message);
  }
}

const PORT = process.env.PORT || 5003;

(async function start() {
  await connectDB();
  await seedMainAdmin();

  app.listen(PORT, () => {
    console.log(`[SERVER] Smart Polling Allocation API running on http://localhost:${PORT}`);
  });
})();