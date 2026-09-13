const Officer = require('../models/Officer');
const Allocation = require('../models/Allocation');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');
const uploadBatchService = require('../services/uploadBatchService');
const countService = require('../services/countService');
const { scopeFilter } = require('../services/roleService');
const { sortByOfficerId } = require('../utils/naturalSort');

/** Escapes a user-provided value so it is safe inside a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a MongoDB query from the search/filter query-string params, then
 * FORCES the logged-in user's data scope on top (Mandal Officers only ever
 * see their assigned Mandal - any client-supplied mandal filter is ignored).
 */
function buildOfficerFilter(req) {
  const filter = {};
  const { search, ward, designation } = req.query;

  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { officerId: re },
      { officerName: re },
      { mobileNumber: re },
      { locality: re },
    ];
  }
  if (ward) filter.ward = ward;
  if (designation) filter.designation = designation;

  const scope = scopeFilter(req.user);
  if (scope) {
    // Mandal Officer: force the assigned mandal (never trust client params).
    Object.assign(filter, scope);
  } else if (req.query.mandal) {
    // Full-access roles may use the optional mandal filter.
    filter.mandal = {
      $regex: new RegExp(`^${escapeRegex(String(req.query.mandal).trim())}$`, 'i'),
    };
  }
  return filter;
}

/** GET /api/officers?search=&mandal=&ward=&page=&limit= */
async function getOfficers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildOfficerFilter(req);

    // Natural Officer ID ordering (OFF1 < OFF2 < OFF10) cannot be expressed by
    // a plain MongoDB string sort, so sort in memory and then paginate.
    const all = await Officer.find(filter).lean();
    const sorted = sortByOfficerId(all);
    const total = sorted.length;
    const officers = sorted.slice((page - 1) * limit, page * limit);

    return res.json({
      success: true,
      data: officers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/officers - create one officer (duplicate Officer ID blocked by schema). */
async function createOfficer(req, res, next) {
  try {
    const officer = await Officer.create(req.body);
    return res.status(201).json({ success: true, data: officer });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/officers/:id - update an existing officer. */
async function updateOfficer(req, res, next) {
  try {
    const officer = await Officer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!officer) {
      return res.status(404).json({ success: false, message: 'Officer not found' });
    }
    return res.json({ success: true, data: officer });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/officers/:id - remove an officer (linked data cascaded). */
async function deleteOfficer(req, res, next) {
  try {
    const officer = await Officer.findById(req.params.id);
    if (!officer) {
      return res.status(404).json({ success: false, message: 'Officer not found' });
    }

    // Cascade: remove this officer's allocations (and fix booth counters)
    // plus any SMS notifications, so no orphaned records remain.
    const allocs = await Allocation.find({ officer: officer._id }).lean();
    if (allocs.length > 0) {
      await Allocation.deleteMany({ officer: officer._id });
      const boothCounts = {};
      for (const a of allocs) {
        const boothId = a.booth ? String(a.booth) : '';
        if (boothId) boothCounts[boothId] = (boothCounts[boothId] || 0) + 1;
      }
      for (const [boothId] of Object.entries(boothCounts)) {
        // Recalculate from the REAL allocation documents (never stale arithmetic).
        await countService.recalculateBoothCounts(boothId);
      }
    }
    await Notification.deleteMany({ officer: officer._id });
    await officer.deleteOne();

    return res.json({
      success: true,
      message: `Officer '${officer.officerId}' deleted with ${allocs.length} allocation(s)`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/officers/grouped?search=&mandal=
 * Returns every matching officer grouped by Mandal so the UI can render one
 * separate section per Mandal (uploaded files are processed mandal-wise and
 * must never be mixed together).
 */
async function getOfficersGrouped(req, res, next) {
  try {
    const filter = buildOfficerFilter(req);
    const officers = await Officer.find(filter).sort({ mandal: 1, officerId: 1 }).lean();

    const groups = new Map();
    for (const officer of officers) {
      const key = officer.mandal || 'Unspecified';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(officer);
    }

    const data = [...groups.entries()]
      .map(([mandal, list]) => ({ mandal, total: list.length, officers: sortByOfficerId(list) }))
      .sort((a, b) => a.mandal.localeCompare(b.mandal));

    return res.json({
      success: true,
      data,
      totalOfficers: officers.length,
      totalMandals: groups.size,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/officers/all?mandal=
 * Bulk delete - removes every officer (optionally scoped to a single Mandal,
 * i.e. "delete this uploaded file's data") together with:
 *   - all of their allocations (booth counters corrected),
 *   - all of their SMS notifications,
 *   - upload-batch records whose rows are all gone ("entire uploaded file").
 */
async function deleteAllOfficers(req, res, next) {
  try {
    const filter = {};
    if (req.query.mandal) {
      filter.mandal = { $regex: new RegExp(`^${escapeRegex(req.query.mandal.trim())}$`, 'i') };
    }

    const officers = await Officer.find(filter).select('_id officerId').lean();
    if (officers.length === 0) {
      return res.status(404).json({ success: false, message: 'No officers found to delete' });
    }
    const ids = officers.map((o) => o._id);

    // 1. Cascade: remove the officers' allocations and free the booth slots.
    const allocs = await Allocation.find({ officer: { $in: ids } }).select('booth').lean();
    const delAllocs = await Allocation.deleteMany({ officer: { $in: ids } });

    const boothCounts = {};
    for (const a of allocs) {
      const boothId = a.booth ? String(a.booth) : '';
      if (boothId) boothCounts[boothId] = (boothCounts[boothId] || 0) + 1;
    }
    for (const [boothId] of Object.entries(boothCounts)) {
      // Recalculate from the REAL allocation documents (never stale arithmetic).
      await countService.recalculateBoothCounts(boothId);
    }

    // 2. Notifications + the officers themselves.
    const delNotifs = await Notification.deleteMany({ officer: { $in: ids } });
    const delOfficers = await Officer.deleteMany({ _id: { $in: ids } });

    // 3. Drop upload-batch records that no longer contain any live officer.
    const prunedBatches = await uploadBatchService.pruneUploadBatches('officers');

    return res.json({
      success: true,
      message:
        `Deleted ${delOfficers.deletedCount} officer(s)` +
        `${req.query.mandal ? ` in Mandal '${req.query.mandal}'` : ''} - removed ` +
        `${delAllocs.deletedCount} allocation(s), ${delNotifs.deletedCount} notification(s)` +
        `${prunedBatches ? `, ${prunedBatches} uploaded file record(s) cleared` : ''}`,
      removed: {
        officers: delOfficers.deletedCount || 0,
        allocations: delAllocs.deletedCount || 0,
        notifications: delNotifs.deletedCount || 0,
        uploadBatches: prunedBatches,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOfficers,
  getOfficersGrouped,
  createOfficer,
  updateOfficer,
  deleteOfficer,
  deleteAllOfficers,
  buildOfficerFilter,
};