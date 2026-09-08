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
 * Seeds the demo user accounts used by the role-based login system.
 * Demo accounts are created only when missing; in non-production environments
 * their passwords are kept in sync with the documented defaults every boot so
 * the example logins always work (disable with SEED_DEMO_PASSWORDS=false).
 *
 * Seeded accounts:
 *   admin            / Admin@123   -> SUPER_ADMIN (admin user can be overridden
 *                                     via ADMIN_USERNAME / ADMIN_PASSWORD)
 *   allocator        / Allocate@123 -> ALLOCATION_OFFICER
 *   mandal_kakinada  / Mandal@123  -> MANDAL_OFFICER (Kakinada)
 *   mandal_rajahmundry / Mandal@123 -> MANDAL_OFFICER (Rajahmundry)
 *   officer001       / Officer@123 -> BOOTH_OFFICER (links to officer OFFICER001)
 */
async function seedDefaultUsers() {
  const { ROLES } = require('./services/roleService');
  const bcrypt = require('bcryptjs');

  const demoUsers = [
    {
      username: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
      password: process.env.ADMIN_PASSWORD || 'Admin@123',
      name: 'District Collector',
      role: ROLES.SUPER_ADMIN,
      district: process.env.ADMIN_DISTRICT || '',
    },
    {
      username: 'allocator',
      password: 'Allocate@123',
      name: 'Allocation Officer',
      role: ROLES.ALLOCATION_OFFICER,
      district: '',
    },
    {
      username: 'mandal_kakinada',
      password: 'Mandal@123',
      name: 'Mandal Officer - Kakinada',
      role: ROLES.MANDAL_OFFICER,
      assignedMandal: 'Kakinada',
      district: '',
    },
    {
      username: 'mandal_rajahmundry',
      password: 'Mandal@123',
      name: 'Mandal Officer - Rajahmundry',
      role: ROLES.MANDAL_OFFICER,
      assignedMandal: 'Rajahmundry',
      district: '',
    },
    {
      username: 'officer001',
      password: 'Officer@123',
      name: 'Booth Officer 001',
      role: ROLES.BOOTH_OFFICER,
      assignedOfficerId: 'OFFICER001',
      assignedBooth: '',
      district: '',
    },
  ];

  const production = process.env.NODE_ENV === 'production';
  if (production && process.env.SEED_DEMO_USERS === 'false') {
    console.log('[AUTH] Demo user seeding disabled by SEED_DEMO_USERS=false');
    return;
  }

  for (const demo of demoUsers) {
    const existing = await Admin.findOne({ username: demo.username }).select('+password');
    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await Admin.create({ ...demo, password: await bcrypt.hash(demo.password, 10) });
      console.log(`[AUTH] Seeded demo account '${demo.username}' (${demo.role})`);
    } else {
      let dirty = false;

      // Backfill accounts created before the role system existed (they have no
      // `role` field, which used to break role-based routing after login and
      // made every authorize() check fail).
      if (!existing.role) {
        existing.role = demo.role;
        if (demo.name && !existing.name) existing.name = demo.name;
        if (demo.district && !existing.district) existing.district = demo.district;
        if (demo.assignedMandal && !existing.assignedMandal) {
          existing.assignedMandal = demo.assignedMandal;
        }
        if (demo.assignedOfficerId && !existing.assignedOfficerId) {
          existing.assignedOfficerId = demo.assignedOfficerId;
        }
        dirty = true;
        console.log(`[AUTH] Backfilled role of demo account '${demo.username}' -> ${demo.role}`);
      }

      // Keep documented demo passwords working in development.
      if (!production && process.env.SEED_DEMO_PASSWORDS !== 'false') {
        // eslint-disable-next-line no-await-in-loop
        const ok = await existing.comparePassword(demo.password);
        if (!ok) {
          // eslint-disable-next-line no-await-in-loop
          existing.password = await bcrypt.hash(demo.password, 10);
          dirty = true;
          console.log(`[AUTH] Updated password of demo account '${demo.username}'`);
        }
      }

      // eslint-disable-next-line no-await-in-loop
      if (dirty) await existing.save();
    }
  }
}

const PORT = process.env.PORT || 5000;

(async function start() {
  await connectDB();
  await seedDefaultUsers();

  app.listen(PORT, () => {
    console.log(`[SERVER] Smart Polling Allocation API running on http://localhost:${PORT}`);
  });
})();