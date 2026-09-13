const Allocation = require('../models/Allocation');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');
const allocationService = require('../services/allocationService');
const countService = require('../services/countService');
const { scopeFilter, notificationScopeFilter, escapeRegex } = require('../services/roleService');
const { compareOfficerIds } = require('../utils/naturalSort');

const STATUS = allocationService.STATUS; // ALLOCATED / CANCELLED / REALLOCATED

/**
 * POST /api/allocation/run
 * Executes the full allocation algorithm against the REAL uploaded data.
 * Safe to re-run: officers with an existing ALLOCATED allocation are skipped.
 */
async function runAllocation(req, res, next) {
  try {
    const result = await allocationService.runAllocation();
    return res.json({
      success: true,
      message: 'Allocation completed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/** Builds the allocations-list filter (status + mandal + role scope). */
function buildAllocationFilter(req) {
  const filter = {};
  const { status, mandal } = req.query;
  if (status) filter.status = status;
  const scope = scopeFilter(req.user);
  if (scope) {
    Object.assign(filter, scope);
  } else if (mandal) {
    filter.mandal = { $regex: new RegExp(`^${escapeRegex(String(mandal).trim())}$`, 'i') };
  }
  return filter;
}

/**
 * GET /api/allocation?status=&mandal=&page=&limit=
 * Returns every allocation (populated officer + booth), newest first.
 */
async function getAllocations(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildAllocationFilter(req);
    const [data, total] = await Promise.all([
      Allocation.find(filter)
        .populate('officer')
        .populate('booth')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Allocation.countDocuments(filter),
    ]);
    // Officer ID ascending (natural numeric order: OFF1 < OFF2 < OFF10).
    data.sort((a, b) =>
      compareOfficerIds(
        a.officer?.officerId || a.officerId || '',
        b.officer?.officerId || b.officerId || ''
      )
    );
    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/allocation/mandals
 * Per-Mandal overview (officers, booths, required slots, allocated/cancelled).
 */
async function getAllocationMandals(req, res, next) {
  try {
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
            allocated: { $sum: { $cond: [{ $eq: ['$status', STATUS.ALLOCATED] }, 1, 0] } },
            reallocated: { $sum: { $cond: [{ $eq: ['$status', STATUS.REALLOCATED] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', STATUS.CANCELLED] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const map = new Map();
    const seed = (mandal) => {
      if (!map.has(mandal)) {
        map.set(mandal, {
          mandal,
          officers: 0,
          booths: 0,
          required: 0,
          total: 0,
          allocated: 0,
          reallocated: 0,
          cancelled: 0,
          unallocated: 0,
        });
      }
      return map.get(mandal);
    };

    officerStats.forEach((r) => {
      const entry = seed(r._id);
      entry.officers = r.officers;
    });
    boothStats.forEach((r) => {
      const entry = seed(r._id);
      entry.booths = r.booths;
      entry.required = r.required || 0;
    });
    allocStats.forEach((r) => {
      const entry = seed(r._id);
      entry.total = r.total || 0;
      entry.allocated = r.allocated || 0;
      entry.reallocated = r.reallocated || 0;
      entry.cancelled = r.cancelled || 0;
    });

    for (const entry of map.values()) {
      entry.unallocated = Math.max(0, entry.officers - entry.allocated);
    }

    return res.json({
      success: true,
      data: [...map.values()].sort((a, b) => a.mandal.localeCompare(b.mandal)),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/allocation/suitable-booths/:officerId  (also /api/allocations/...)
 * Returns only ready-and-suitable booths for the officer.
 */
async function getSuitableBooths(req, res, next) {
  try {
    const officerId = String(req.params.officerId || '').trim();
    if (!officerId) {
      return res.status(400).json({ success: false, message: 'Officer ID is required' });
    }
    const officer = await Officer.findOne({
      officerId: { $regex: new RegExp(`^${escapeRegex(officerId)}$`, 'i') },
      isActive: true,
    }).lean();
    if (!officer) {
      return res.status(404).json({ success: false, message: `Officer '${officerId}' not found` });
    }
    const booths = await allocationService.findSuitableBoothsForOfficer(officer);
    return res.json({ success: true, data: { officer, booths } });
  } catch (error) {
    next(error);
  }
}

/** POST /api/allocation/:id/cancel */
async function cancelAllocationAction(req, res, next) {
  try {
    const result = await allocationService.cancelAllocation(req.params.id);
    // Include the updated booth capacity snapshot (spec API response shape).
    const booth = result.booth
      ? {
          requiredOfficers: result.booth.requiredOfficers,
          allocatedOfficerCount: result.booth.allocatedOfficerCount,
          availableSlots: result.booth.availableSlots,
          isFull: result.booth.availableSlots <= 0,
          overAllocated: result.booth.overAllocated || false,
        }
      : null;
    return res.json({
      success: true,
      message: result.message,
      data: result.allocation,
      booth,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/allocation/:id/reallocate */
async function reallocateAllocation(req, res, next) {
  try {
    const preferredBoothId = req.body?.preferredBoothId || null;
    const result = await allocationService.reallocateOfficer(req.params.id, preferredBoothId);
    const booth = result.booth
      ? {
          requiredOfficers: result.booth.requiredOfficers,
          allocatedOfficerCount: result.booth.allocatedOfficerCount,
          availableSlots: result.booth.availableSlots,
          isFull: result.booth.availableSlots <= 0,
          overAllocated: result.booth.overAllocated || false,
        }
      : null;
    return res.json({
      success: true,
      message: 'Officer reallocated successfully',
      data: {
        newAllocation: result.newAllocation,
        oldAllocation: result.oldAllocation,
        chosenBooth: result.chosenBooth,
        booth,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/allocation/manual  { officerId, boothId }
 * Admin manually assigns an unallocated officer to a specific booth.
 * The backend enforces the full validation chain (booth existence, activity,
 * same-Mandal, single active allocation per officer, and the booth
 * requiredOfficers capacity check against the actual DB allocations).
 */
async function manualAllocateAction(req, res, next) {
  try {
    const { officerId, boothId } = req.body || {};
    if (!officerId || !boothId) {
      return res.status(400).json({
        success: false,
        message: 'Both officerId and boothId are required',
      });
    }
    const result = await allocationService.manualAllocate(officerId, boothId, req.user?._id);
    const booth = result.booth || {};
    return res.status(201).json({
      success: true,
      message: `Officer ${result.allocation.officerId} manually allocated to booth ${booth.boothNumber || ''}`.trim(),
      data: result.allocation,
      booth: {
        boothId: result.allocation.booth,
        boothNumber: booth.boothNumber,
        requiredOfficers: booth.requiredOfficers,
        allocatedOfficerCount: booth.allocatedOfficerCount,
        availableSlots: booth.availableSlots,
        isFull: booth.availableSlots <= 0,
        overAllocated: booth.overAllocated || false,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/allocation/over-allocated
 * Data-safety report: booths whose ACTUAL active allocations exceed
 * requiredOfficers (Booth Number, Required, Actual, Excess) plus per-officer
 * allocation rows with keep / flagged-for-review markers.
 */
async function getOverAllocatedBooths(req, res, next) {
  try {
    const overBooths = await countService.findOverAllocatedBooths();
    const report = [];
    for (const booth of overBooths) {
      // Earliest allocations (by allocationDate) are the "keep" candidates.
      const allocations = await Allocation.find({ booth: booth._id, status: STATUS.ALLOCATED })
        .populate('officer', 'officerId officerName designation mobileNumber')
        .sort({ allocationDate: 1, createdAt: 1 })
        .lean();
      const marked = allocations.map((a, index) => ({
        _id: a._id,
        allocationId: a.allocationId,
        officerId: a.officer?.officerId || a.officerId || '',
        officerName: a.officer?.officerName || '',
        allocationDate: a.allocationDate,
        keep: index < booth.requiredOfficers, // earliest valid allocations kept
        flaggedForReview: index >= booth.requiredOfficers,
      }));
      report.push({ ...booth, allocations: marked });
    }
    return res.json({ success: true, count: report.length, data: report });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/allocation/over-allocated/repair
 * Safe correction for over-allocated booths: keeps the EARLIEST valid
 * allocations (up to requiredOfficers) and marks the excess allocations
 * CANCELLED with an explicit review reason (history is preserved, nothing is
 * deleted). Recalculates every affected booth's counters afterwards.
 */
async function repairOverAllocatedBooths(req, res, next) {
  try {
    const overBooths = await countService.findOverAllocatedBooths();
    const repaired = [];
    for (const booth of overBooths) {
      const allocations = await Allocation.find({ booth: booth._id, status: STATUS.ALLOCATED })
        .sort({ allocationDate: 1, createdAt: 1 })
        .select('_id officerId allocationDate status');
      const excess = allocations.slice(booth.requiredOfficers); // keep earliest ones
      const now = new Date();
      const ids = [];
      for (const allocation of excess) {
        allocation.status = STATUS.CANCELLED;
        allocation.cancelledAt = now;
        allocation.adminApproved = false;
        allocation.allocationReason =
          'Excess allocation cancelled by capacity repair (booth was over its required officers)';
        await allocation.save();
        ids.push(allocation._id);
      }
      const counts = await countService.recalculateBoothCounts(booth._id);
      repaired.push({
        boothNumber: booth.boothNumber,
        boothCode: booth.boothId,
        requiredOfficers: booth.requiredOfficers,
        actualAllocatedOfficersBefore: booth.actualAllocatedOfficers,
        excessOfficers: booth.excessOfficers,
        cancelledAllocationIds: ids,
        allocatedOfficerCount: counts.allocatedOfficerCount,
        availableSlots: counts.availableSlots,
      });
    }
    return res.json({
      success: true,
      message: repaired.length
        ? `Repaired ${repaired.length} over-allocated booth(s): excess allocations marked CANCELLED for review (earliest valid allocations kept).`
        : 'No over-allocated booths found. Database is consistent.',
      repaired,
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/dashboard/stats - admin dashboard statistics (requirement J). */
async function getDashboardStats(req, res, next) {
  try {
    const scope = scopeFilter(req.user) || {};
    const notifScope = await notificationScopeFilter(req.user);

    const [
      totalOfficers,
      totalBooths,
      confirmedCapacity,
      allocatedCount,
      reallocatedCount,
      cancelledCount,
      notificationsSent,
    ] = await Promise.all([
      Officer.countDocuments({ ...scope, isActive: true }),
      Booth.countDocuments({ ...scope, isActive: true }),
      Booth.aggregate([
        { $match: { ...scope, isActive: true } },
        { $group: { _id: null, total: { $sum: '$requiredOfficers' } } },
      ]),
      Allocation.countDocuments({ status: STATUS.ALLOCATED, ...scope }),
      Allocation.countDocuments({ status: STATUS.REALLOCATED, ...scope }),
      Allocation.countDocuments({ status: STATUS.CANCELLED, ...scope }),
      Notification.countDocuments({ status: { $ne: 'FAILED' }, ...notifScope }),
    ]);

    const totalBoothCapacity = confirmedCapacity[0]?.total || 0;
    const allocatedOfficers = allocatedCount;
    const unallocatedOfficers = Math.max(0, totalOfficers - allocatedOfficers);

    // Per-Mandal breakdown for the dashboard grid.
    const deployed = await allocationService.getAllocationRows({ status: STATUS.ALLOCATED, ...scope });
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
    const boothsByMandal = await Booth.find({ ...scope, isActive: true }).lean();
    boothsByMandal.forEach((b) => {
      const key = b.mandal || 'Unknown';
      if (!mandalMap.has(key)) {
        mandalMap.set(key, { mandal: key, officers: 0, allocated: 0, vacant: 0 });
      }
      const entry = mandalMap.get(key);
      entry.vacant += Math.max(
        0,
        (b.requiredOfficers || 0) - (b.allocatedOfficerCount || 0)
      );
    });

    return res.json({
      success: true,
      data: {
        totalOfficers,
        totalBooths,
        totalBoothCapacity,
        availableSlots: Math.max(0, totalBoothCapacity - allocatedOfficers),
        filledSlots: allocatedOfficers,
        allocatedOfficers,
        unallocatedOfficers,
        reallocatedCount,
        cancelledAllocations: cancelledCount,
        notificationsSent,
        byMandal: [...mandalMap.values()],
      },
    });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/allocation/all - wipe every allocation and resync counters. */
async function deleteAllAllocations(req, res, next) {
  try {
    const total = await Allocation.countDocuments();
    await Allocation.deleteMany({});
    const sync = await countService.resyncAllBoothCounts();
    return res.json({
      success: true,
      message: `Deleted all ${total} allocation(s) - booth counters resynced (${sync.updated} corrected)`,
      removed: { allocations: total },
    });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/allocation/mandal/:name - wipe one Mandal's allocations. */
async function deleteAllocationsByMandal(req, res, next) {
  try {
    const name = String(req.params.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Mandal name is required' });
    }
    const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const officers = await Officer.find({ mandal: re }).select('_id').lean();
    const filter = {
      $or: [{ mandal: re }, { officer: { $in: officers.map((o) => o._id) } }],
    };
    const del = await Allocation.deleteMany(filter);
    const sync = await countService.resyncAllBoothCounts();
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
  getSuitableBooths,
  manualAllocateAction,
  cancelAllocationAction,
  reallocateAllocation,
  getOverAllocatedBooths,
  repairOverAllocatedBooths,
  getDashboardStats,
  deleteAllAllocations,
  deleteAllocationsByMandal,
};
