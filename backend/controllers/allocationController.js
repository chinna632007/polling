const Allocation = require('../models/Allocation');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');
const allocationService = require('../services/allocationService');
const roleService = require('../services/roleService');
const { ROLES, scopeFilter, notificationScopeFilter, escapeRegex } = roleService;

/**
 * POST /api/allocation/run[?mandal=X]
 * Executes the 9-step allocation algorithm. Safe to re-run.
 * With ?mandal=X only that Mandal's officers/booths are processed, so each
 * uploaded Mandal can be allocated separately.
 */
async function runAllocation(req, res, next) {
  try {
    const result = await allocationService.runAllocation(req.query.mandal || null);
    const scope = req.query.mandal ? ` for Mandal '${req.query.mandal}'` : '';
    return res.json({ success: true, message: `Allocation run completed${scope}`, data: result });
  } catch (error) {
    next(error);
  }
}

/** Recomputes allocatedOfficerCount from live (non-cancelled) allocations. */
async function syncBoothCounters(boothIds = null) {
  const boothFilter = boothIds && boothIds.length > 0 ? { _id: { $in: boothIds } } : {};
  const booths = await Booth.find(boothFilter).select('_id').lean();
  if (booths.length === 0) return;

  const liveCounts = await Allocation.aggregate([
    { $match: { booth: { $in: booths.map((b) => b._id) }, status: { $ne: 'Cancelled' } } },
    { $group: { _id: '$booth', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(liveCounts.map((c) => [String(c._id), c.count]));

  await Promise.all(
    booths.map((b) =>
      Booth.updateOne({ _id: b._id }, { allocatedOfficerCount: countMap.get(String(b._id)) || 0 })
    )
  );
}

/**
 * Builds the filter used by the allocations list (status + mandal + approval).
 * A Mandal Officer's scope ALWAYS overrides any client-supplied mandal param
 * so they can never query another Mandal's allocations.
 */
function buildAllocationFilter(req) {
  const filter = {};
  const { status, mandal, approved } = req.query;
  if (status) filter.status = status;
  if (approved === 'true') filter.adminApproved = true;
  if (approved === 'false') filter.adminApproved = false;

  const scope = scopeFilter(req.user);
  if (scope) {
    Object.assign(filter, scope); // forced for Mandal Officers
  } else if (mandal) {
    filter.mandal = { $regex: new RegExp(`^${escapeRegex(String(mandal).trim())}$`, 'i') };
  }
  return filter;
}

/** Default empty per-Mandal stat row. */
function emptyMandalStat(mandal) {
  return {
    mandal,
    officers: 0,
    booths: 0,
    required: 0,
    total: 0,
    allocated: 0,
    pending: 0,
    unallocated: 0,
    cancelled: 0,
  };
}

/**
 * GET /api/allocation/mandals
 * Per-Mandal overview used to render ONE SEPARATE allocation section per
 * Mandal on the frontend - mandals are never joined together.
 */
async function getAllocationMandals(req, res, next) {
  try {
    // Mandal Officers only ever see their own Mandal in the summary too.
    const scope = scopeFilter(req.user);
    const scopeMatch = scope ? [{ $match: scope }] : [];

    const [officerStats, boothStats, allocStats] = await Promise.all([
      Officer.aggregate([
        ...scopeMatch,
        { $group: { _id: { $ifNull: ['$mandal', 'Unspecified'] }, officers: { $sum: 1 } } },
      ]),
      Booth.aggregate([
        ...scopeMatch,
        {
          $group: {
            _id: { $ifNull: ['$mandal', 'Unspecified'] },
            booths: { $sum: 1 },
            required: { $sum: '$requiredOfficers' },
          },
        },
      ]),
      Allocation.aggregate([
        ...scopeMatch,
        {
          $group: {
            _id: { $ifNull: ['$mandal', 'Unspecified'] },
            total: { $sum: 1 },
            allocated: { $sum: { $cond: [{ $eq: ['$status', 'Allocated'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending Approval'] }, 1, 0] } },
            unallocated: { $sum: { $cond: [{ $eq: ['$status', 'Unallocated'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    // Merge the three sources, merging case-variant mandal names together.
    const map = new Map();
    const entryFor = (name) => {
      const key = String(name || 'Unspecified').trim().toLowerCase() || 'unspecified';
      if (!map.has(key)) map.set(key, emptyMandalStat(name || 'Unspecified'));
      return map.get(key);
    };

    allocStats.forEach((row) => {
      const entry = entryFor(row._id);
      Object.assign(entry, {
        total: row.total,
        allocated: row.allocated,
        pending: row.pending,
        unallocated: row.unallocated,
        cancelled: row.cancelled,
      });
    });
    officerStats.forEach((row) => {
      entryFor(row._id).officers = row.officers;
    });
    boothStats.forEach((row) => {
      const entry = entryFor(row._id);
      entry.booths = row.booths;
      entry.required = row.required;
    });

    const data = [...map.values()].sort((a, b) => a.mandal.localeCompare(b.mandal));
    return res.json({ success: true, data, totalMandals: data.length });
  } catch (error) {
    next(error);
  }
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
 * For Mandal Officers every counter is scoped to their assigned Mandal.
 */
async function getDashboardStats(req, res, next) {
  try {
    const scope = scopeFilter(req.user) || {};
    const notifScope = await notificationScopeFilter(req.user);

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
      Officer.countDocuments(scope),
      Booth.countDocuments(scope),
      Booth.aggregate([{ $match: scope }, { $group: { _id: null, total: { $sum: '$requiredOfficers' } } }]),
      Allocation.countDocuments({ status: 'Allocated', ...scope }),
      Allocation.countDocuments({ status: 'Pending Approval', ...scope }),
      Allocation.countDocuments({ status: 'Unallocated', ...scope }),
      Allocation.countDocuments({ status: 'Cancelled', ...scope }),
      Notification.countDocuments({ status: { $ne: 'FAILED' }, ...notifScope }),
    ]);

    const deployed = await allocationService.getAllocationRows({
      status: { $ne: 'Cancelled' },
      ...scope,
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
    const boothsByMandal = await Booth.find(scope).lean();
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

/**
 * DELETE /api/allocation/all
 * Wipes EVERY allocation record and resyncs all booth counters to zero.
 * Officers/booths themselves are untouched.
 */
async function deleteAllAllocations(req, res, next) {
  try {
    const total = await Allocation.countDocuments();
    await Allocation.deleteMany({});
    await syncBoothCounters(null); // every booth back to its true live count
    return res.json({
      success: true,
      message: `Deleted all ${total} allocation(s) - booth counters were resynced`,
      removed: { allocations: total },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/allocation/mandal/:name
 * Deletes every allocation belonging to ONE Mandal (uploaded files are kept
 * strictly separate) and resyncs the affected booth counters.
 */
async function deleteAllocationsByMandal(req, res, next) {
  try {
    const name = String(req.params.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Mandal name is required' });
    }
    const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Include allocations stored under the officer's Mandal even when the
    // allocation document itself carries a different/empty mandal label.
    const officers = await Officer.find({ mandal: re }).select('_id').lean();
    const filter = {
      $or: [{ mandal: re }, { officer: { $in: officers.map((o) => o._id) } }],
    };

    const affectedBooths = await Allocation.find(filter).distinct('booth');
    const del = await Allocation.deleteMany(filter);
    await syncBoothCounters(affectedBooths.filter(Boolean));

    return res.json({
      success: true,
      message: `Deleted ${del.deletedCount} allocation(s) in Mandal '${name}'`,
      removed: { allocations: del.deletedCount || 0 },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  runAllocation,
  getAllocations,
  getAllocationMandals,
  updateAllocation,
  approveAllocation,
  reallocateAllocation,
  cancelAllocationAction,
  getDashboardStats,
  deleteAllAllocations,
  deleteAllocationsByMandal,
};