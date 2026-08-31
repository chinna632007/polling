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
 * Seeds the default admin ONLY if the admin table is completely empty.
 * This replaces the old behavior of always seeding 'admin', which made it
 * impossible to use a clean /api/auth/boot flow when DB_HAS_NO_ADMINS is set.
 */
async function seedDefaultAdmin() {
  const existing = await Admin.findOne({});
  if (existing) return;

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hash });
  console.log(`[AUTH] Default admin seeded: '${username}' (from ADMIN_USERNAME/ADMIN_PASSWORD in .env)`);
}

const PORT = process.env.PORT || 5000;

(async function start() {
  await connectDB();
  await seedDefaultAdmin();

  app.listen(PORT, () => {
    console.log(`[SERVER] Smart Polling Allocation API running on http://localhost:${PORT}`);
  });
})();