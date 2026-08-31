const Allocation = require('../models/Allocation');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');
const allocationService = require('../services/allocationService');

/**
 * POST /api/allocation/run
 * Executes the 9-step allocation algorithm. Safe to re-run.
 */
async function runAllocation(req, res, next) {
  try {
    const result = await allocationService.runAllocation();
    return res.json({ success: true, message: 'Allocation run completed', data: result });
  } catch (error) {
    next(error);
  }
}

/** Builds the filter used by the allocations list (status + mandal + approval). */
function buildAllocationFilter(req) {
  const filter = {};
  const { status, mandal, approved } = req.query;
  if (status) filter.status = status;
  if (mandal) filter.mandal = { $regex: new RegExp(`^${mandal.trim()}$`, 'i') };
  if (approved === 'true') filter.adminApproved = true;
  if (approved === 'false') filter.adminApproved = false;
  return filter;
}

/**
 * GET /api/allocation?status=&mandal=&search=&page=&limit=
 * Returns allocations populated with the officer and booth details.
 */
async function getAllocations(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildAllocationFilter(req);

    const query = Allocation.find(filter)
      .populate('officer')
      .populate('booth')
      .sort({ allocationDate: -1 });

    if (req.query.search) {
      // Search on populated officer/booth fields.
      const all = await query.clone().lean();
      const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const filtered = all.filter(
        (a) =>
          re.test(a.officer?.officerId || '') ||
          re.test(a.officer?.officerName || '') ||
          re.test(a.officer?.mobileNumber || '') ||
          re.test(a.booth?.boothNumber || '') ||
          re.test(a.booth?.boothName || '')
      );
      return res.json({
        success: true,
        data: filtered.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          pages: Math.ceil(filtered.length / limit),
        },
      });
    }

    const [data, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit).lean(),
      Allocation.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/allocation/:id - update safe fields (status, notes, etc.). */
async function updateAllocation(req, res, next) {
  try {
    const allowed = Object.keys(req.body).filter((key) =>
      ['status', 'adminApproved', 'addressMatchScore', 'rejectedReasons'].includes(key)
    );
    const patch = {};
    allowed.forEach((key) => {
      patch[key] = req.body[key];
    });

    if (patch.status === 'Cancelled') {
      const cancelled = await allocationService.cancelAllocation(req.params.id);
      return res.json({ success: true, data: cancelled.allocation });
    }

    const allocation = await Allocation.findByIdAndUpdate(req.params.id, patch, {
      new: true,
      runValidators: true,
    })
      .populate('officer')
      .populate('booth');
    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }
    return res.json({ success: true, data: allocation });
  } catch (error) {
    next(error);
  }
}
/** POST /api/allocation/:id/approve - mark an allocation as approved. */
async function approveAllocation(req, res, next) {
  try {
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }
    if (allocation.status === 'Unallocated') {
      return res
        .status(400)
        .json({ success: false, message: 'An Unallocated officer cannot be approved' });
    }
    if (allocation.status === 'Cancelled') {
      return res
        .status(400)
        .json({ success: false, message: 'A cancelled allocation cannot be approved' });
    }

    allocation.status = 'Allocated';
    allocation.adminApproved = true;
    allocation.approvedAt = new Date();
    await allocation.save();

    return res.json({ success: true, message: 'Allocation approved', data: allocation });
  } catch (error) {
    next(error);
  }
}

/** POST /api/allocation/:id/reallocate - move the officer to another booth. */
async function reallocateAllocation(req, res, next) {
  try {
    const { preferredBoothId } = req.body || {};
    const result = await allocationService.reallocateOfficer(req.params.id, preferredBoothId);
    return res.json({
      success: true,
      message: 'Officer reallocated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/allocation/:id/cancel - cancel an allocation and free its slot. */
async function cancelAllocationAction(req, res, next) {
  try {
    const { changed, allocation } = await allocationService.cancelAllocation(req.params.id);
    return res.json({
      success: true,
      message: changed ? 'Allocation cancelled' : 'Allocation was already cancelled',
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/stats
 * Supplies every number shown on the Dashboard page.
 */
async function getDashboardStats(req, res, next) {
  try {
    const [
      totalOfficers,
      totalBooths,
      confirmedCapacity,
      allocatedCount,
      pendingCount,
      unallocatedCount,
      cancelledCount,
      notificationsSent,
    ] = await Promise.all([
      Officer.countDocuments(),
      Booth.countDocuments(),
      Booth.aggregate([{ $group: { _id: null, total: { $sum: '$requiredOfficers' } } }]),
      Allocation.countDocuments({ status: 'Allocated' }),
      Allocation.countDocuments({ status: 'Pending Approval' }),
      Allocation.countDocuments({ status: 'Unallocated' }),
      Allocation.countDocuments({ status: 'Cancelled' }),
      Notification.countDocuments({ status: { $ne: 'FAILED' } }),
    ]);

    const deployed = await allocationService.getAllocationRows({
      status: { $ne: 'Cancelled' },
    });
    const mandalMap = new Map();
    deployed.forEach((a) => {
      if (!a.officer) return;
      const key = a.officer.mandal || a.mandal || 'Unknown';
      if (!mandalMap.has(key)) {
        mandalMap.set(key, { mandal: key, officers: 0, allocated: 0, vacant: 0 });
      }
      const entry = mandalMap.get(key);
      entry.officers += 1;
      if (a.booth) entry.allocated += 1;
    });
    const boothsByMandal = await Booth.find().lean();
    boothsByMandal.forEach((b) => {
      const key = b.mandal || 'Unknown';
      if (!mandalMap.has(key)) {
        mandalMap.set(key, { mandal: key, officers: 0, allocated: 0, vacant: 0 });
      }
      const entry = mandalMap.get(key);
      entry.vacant += Math.max(0, b.requiredOfficers - b.allocatedOfficerCount);
    });

    return res.json({
      success: true,
      data: {
        totalOfficers,
        totalBooths,
        totalBoothCapacity: confirmedCapacity[0]?.total || 0,
        allocatedOfficers: allocatedCount,
        pendingApproval: pendingCount,
        unallocatedOfficers: unallocatedCount,
        cancelledAllocations: cancelledCount,
        notificationsSent,
        byMandal: [...mandalMap.values()],
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  runAllocation,
  getAllocations,
  updateAllocation,
  approveAllocation,
  reallocateAllocation,
  cancelAllocationAction,
  getDashboardStats,
};