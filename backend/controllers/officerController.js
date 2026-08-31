const Officer = require('../models/Officer');
const Allocation = require('../models/Allocation');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');

/** Builds a MongoDB query from the search/filter query-string params. */
function buildOfficerFilter(req) {
  const filter = {};
  const { search, mandal, ward, designation } = req.query;

  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { officerId: re },
      { officerName: re },
      { mobileNumber: re },
      { locality: re },
    ];
  }
  if (mandal) filter.mandal = { $regex: new RegExp(`^${mandal.trim()}$`, 'i') };
  if (ward) filter.ward = ward;
  if (designation) filter.designation = designation;
  return filter;
}

/** GET /api/officers?search=&mandal=&ward=&page=&limit= */
async function getOfficers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildOfficerFilter(req);

    const [officers, total] = await Promise.all([
      Officer.find(filter).sort({ officerId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Officer.countDocuments(filter),
    ]);

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
      for (const [boothId, count] of Object.entries(boothCounts)) {
        // Clamp so the counter can never go below zero.
        const booth = await Booth.findById(boothId).lean();
        if (booth) {
          await Booth.updateOne(
            { _id: boothId },
            { allocatedOfficerCount: Math.max(0, booth.allocatedOfficerCount - count) }
          );
        }
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

module.exports = { getOfficers, createOfficer, updateOfficer, deleteOfficer, buildOfficerFilter };