const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');

/** Builds a MongoDB query from the search/filter query-string params. */
function buildBoothFilter(req) {
  const filter = {};
  const { search, mandal, ward } = req.query;

  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { boothId: re },
      { boothName: re },
      { boothNumber: re },
      { buildingName: re },
      { locality: re },
    ];
  }
  if (mandal) filter.mandal = { $regex: new RegExp(`^${mandal.trim()}$`, 'i') };
  if (ward) filter.ward = ward;
  return filter;
}

/** GET /api/booths?search=&mandal=&ward=&page=&limit= */
async function getBooths(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildBoothFilter(req);

    const [booths, total] = await Promise.all([
      Booth.find(filter).sort({ boothId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Booth.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: booths,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/booths - create one booth (duplicate Booth ID blocked by schema). */
async function createBooth(req, res, next) {
  try {
    const booth = await Booth.create({ ...req.body, allocatedOfficerCount: 0 });
    return res.status(201).json({ success: true, data: booth });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/booths/:id - update an existing booth. */
async function updateBooth(req, res, next) {
  try {
    const booth = await Booth.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!booth) {
      return res.status(404).json({ success: false, message: 'Booth not found' });
    }
    return res.json({ success: true, data: booth });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/booths/:id - remove a booth (linked allocations cascaded). */
async function deleteBooth(req, res, next) {
  try {
    const booth = await Booth.findById(req.params.id);
    if (!booth) {
      return res.status(404).json({ success: false, message: 'Booth not found' });
    }

    // Cascade: remove any allocations that referenced this booth so no
    // orphaned records remain.
    const allocCount = await Allocation.countDocuments({ booth: booth._id });
    if (allocCount > 0) {
      await Allocation.deleteMany({ booth: booth._id });
    }
    await booth.deleteOne();

    return res.json({
      success: true,
      message: `Booth '${booth.boothId}' deleted with ${allocCount} allocation(s)`,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getBooths, createBooth, updateBooth, deleteBooth, buildBoothFilter };