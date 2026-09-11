/**
 * allocationService.js
 * =====================
 * Complete polling-booth officer allocation algorithm (single-admin flow).
 *
 * Steps:
 *   1. Load active officers + active booths from MongoDB (isActive: true).
 *   2. Group officers and booths by Mandal (same Mandal is mandatory).
 *   3. Skip officers that already hold an ALLOCATED allocation.
 *   4. For every unallocated officer find suitable booths:
 *        - same Mandal
 *        - available capacity
 *        - NOT related to the officer's residential locality
 *   5. Choose the booth with the lowest allocatedOfficerCount (balanced
 *      distribution); deterministic tie-break by boothId.
 *   6. Create the allocation (status ALLOCATED) and resync booth counters
 *      from the actual allocation documents (requirement B).
 *   7. Report unallocated officers with a clear reason.
 */

const mongoose = require('mongoose');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');
const countService = require('./countService');
const {
  normalizeAddress,
  isRelated,
  compatibilityReason,
  mandalKey,
} = require('./addressMatchingService');

const STATUS = {
  ALLOCATED: 'ALLOCATED',
  CANCELLED: 'CANCELLED',
  REALLOCATED: 'REALLOCATED',
};

// Guards against two concurrent runs of the algorithm (requirement C).
let runInProgress = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic allocationId: ALLOC-YYYYMMDD-<officerId>. */
function makeAllocationId(officer) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `ALLOC-${ymd}-${String(officer.officerId || '').toUpperCase()}`;
}

/** Uniquifies the deterministic id (-R2, -R3, ...) for repeated allocations. */
async function nextAllocationId(officer) {
  const base = makeAllocationId(officer);
  let candidate = base;
  let n = 2;
  while ((await Allocation.exists({ allocationId: candidate })) && n < 100) {
    candidate = `${base}-R${n}`;
    n += 1;
  }
  return candidate;
}

function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

/**
 * Booth suitability score (requirement D - balanced distribution):
 *   - dominant term prefers booths with the LOWEST allocatedOfficerCount
 *   - small bonus for a different ward (secondary rule only)
 *   - small bonus for remaining capacity
 */
function scoreSuitability(officer, booth, capacity) {
  const check = isRelated(officer, booth);
  if (check.related) return { suitable: false, score: -Infinity, check };

  let score = 0;
  const current = Math.max(0, booth.allocatedOfficerCount || 0);
  score += 1000 * (1 / (current + 1)); // prefer fewer allocated officers

  const officerWard = normalizeAddress(officer.ward);
  const boothWard = normalizeAddress(booth.ward);
  if (officerWard && boothWard && officerWard !== boothWard) score += 10;

  score += Math.min(Math.max(0, capacity || 0), 5) * 2;
  return { suitable: true, score, check };
}

/** Builds a clear reason when no suitable booth exists for an officer. */
function pickUnallocatedReason(officer, mandalBooths, liveCounts) {
  let anyCapacity = false;
  let anySuitable = false;
  for (const booth of mandalBooths) {
    const required = Math.max(0, booth.requiredOfficers || 0);
    const live = liveCounts.get(String(booth._id)) || 0;
    if (Math.max(0, required - live) > 0) anyCapacity = true;
    if (!isRelated(officer, booth).related) anySuitable = true;
  }
  const allFull = !anyCapacity;
  const allRelated = !anySuitable;
  if (allFull && allRelated) {
    return 'All suitable booths are full and all booths are related to the officer residential locality.';
  }
  if (allFull) return 'All suitable booths are full.';
  if (allRelated) return 'All booths are related to the officer residential locality.';
  return 'No suitable booth available in the same Mandal.';
}

// ---------------------------------------------------------------------------
// Suitable booth lookup (used by GET /api/allocations/suitable-booths/:officerId)
// ---------------------------------------------------------------------------

/**
 * Returns ONLY booths that are:
 *   - in the same Mandal as the officer
 *   - active
 *   - have available capacity
 *   - are NOT related to the officer's residential locality
 */
async function findSuitableBoothsForOfficer(officer) {
  const mandalName = String(officer.mandal || '').trim();
  if (!mandalName) return [];
  const escaped = mandalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const booths = await Booth.find({
    mandal: { $regex: new RegExp(`^${escaped}$`, 'i') },
    isActive: true,
  }).lean();

  const result = [];
  for (const booth of booths) {
    const required = Math.max(0, booth.requiredOfficers || 0);
    const live = Math.min(
      await countService.getLiveAllocatedCount(booth._id),
      required
    );
    const availableSlots = Math.max(0, required - live);
    if (availableSlots <= 0) continue;

    const check = isRelated(officer, booth);
    if (check.related) continue;

    result.push({
      _id: booth._id,
      boothId: booth.boothId,
      boothNumber: booth.boothNumber,
      boothName: booth.boothName,
      buildingName: booth.buildingName,
      street: booth.street,
      locality: booth.locality,
      ward: booth.ward,
      mandal: booth.mandal,
      district: booth.district,
      requiredOfficers: required,
      allocatedOfficerCount: live,
      availableSlots,
      addressMatchScore: Math.max(0, Math.round(check.score)),
      reason: compatibilityReason(officer, booth),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Run automatic allocation
// ---------------------------------------------------------------------------

async function runAllocation() {
  if (runInProgress) {
    const error = new Error('Allocation is already running - please wait a moment');
    error.statusCode = 409;
    throw error;
  }
  runInProgress = true;

  const result = {
    totalOfficers: 0,
    totalBooths: 0,
    allocated: 0,
    unallocated: 0,
    skipped: 0,
    allocations: [],
    unallocatedOfficers: [],
  };

  try {
    const booths = await Booth.find({ isActive: true }).lean();
    const officers = await Officer.find({ isActive: true }).lean();
    result.totalBooths = booths.length;
    result.totalOfficers = officers.length;

    const boothsByMandal = groupBy(booths, (b) => mandalKey(b.mandal));
    const officersByMandal = groupBy(officers, (o) => mandalKey(o.mandal));
    const liveCounts = await countService.computeBoothCountsMap();

    // Officers who already hold an active allocation are skipped (requirement C).
    const activeAllocs = await Allocation.find({ status: STATUS.ALLOCATED })
      .select('officer')
      .lean();
    const alreadyAllocated = new Set(activeAllocs.map((a) => String(a.officer)));

    const created = [];

    for (const [, groupOfficers] of officersByMandal.entries()) {
      const mandalBooths = boothsByMandal.get(mandalKey(groupOfficers[0]?.mandal)) || [];
      for (const officer of groupOfficers) {
        const officerKey = String(officer._id);
        if (alreadyAllocated.has(officerKey)) {
          result.skipped += 1;
          continue;
        }

        if (mandalBooths.length === 0) {
          result.unallocated += 1;
          result.unallocatedOfficers.push({ ...officerToUnallocatedRow(officer), reason: 'No suitable booth available in the same Mandal.' });
          continue;
        }

        const candidates = [];
        for (const booth of mandalBooths) {
          const required = Math.max(0, booth.requiredOfficers || 0);
          const live = liveCounts.get(String(booth._id)) || 0;
          const available = Math.max(0, required - live);
          if (available <= 0) continue;
          const evalResult = scoreSuitability(officer, { ...booth, allocatedOfficerCount: live }, available);
          if (!evalResult.suitable) continue;
          candidates.push({ booth, available, score: evalResult.score, check: evalResult.check });
        }

        if (candidates.length === 0) {
          result.unallocated += 1;
          result.unallocatedOfficers.push({
            ...officerToUnallocatedRow(officer),
            reason: pickUnallocatedReason(officer, mandalBooths, liveCounts),
          });
          continue;
        }

        // Balanced choice (requirement D) + deterministic tie-break.
        candidates.sort(
          (a, b) => b.score - a.score || String(a.booth._id).localeCompare(String(b.booth._id))
        );
        const best = candidates[0];

        // Final safety check (requirement F): still no active allocation.
        const already = await Allocation.exists({ officer: officer._id, status: STATUS.ALLOCATED });
        if (already) {
          result.skipped += 1;
          continue;
        }

        const allocation = await Allocation.create({
          allocationId: await nextAllocationId(officer),
          officer: officer._id,
          officerId: officer.officerId,
          booth: best.booth._id,
          boothId: best.booth.boothId,
          mandal: officer.mandal || best.booth.mandal || '',
          status: STATUS.ALLOCATED,
          allocationDate: new Date(),
          allocatedAt: new Date(),
          adminApproved: true,
          addressMatchScore: Math.max(0, Math.round(best.check.score)),
          addressValidationReason: compatibilityReason(officer, best.booth),
          allocationReason: (best.check.reasons && best.check.reasons[0]) || '',
        });

        created.push(allocation);
        liveCounts.set(String(best.booth._id), (liveCounts.get(String(best.booth._id)) || 0) + 1);
        alreadyAllocated.add(officerKey);
        result.allocated += 1;
      }
    }

    // Recalculate booth counters from the REAL allocation documents.
    for (const allocation of created) {
      await countService.recalculateBoothCounts(allocation.booth);
    }

    result.allocations = created.map((a) => a._id);
    return result;
  } finally {
    runInProgress = false;
  }
}

function officerToUnallocatedRow(officer) {
  return {
    officer: officer._id,
    officerId: officer.officerId,
    officerName: officer.officerName,
    designation: officer.designation,
    mobileNumber: officer.mobileNumber,
    mandal: officer.mandal || '',
    locality: officer.locality || '',
    ward: officer.ward || '',
  };
}

// ---------------------------------------------------------------------------
// Cancel allocation
// ---------------------------------------------------------------------------

async function cancelAllocation(allocationId) {
  const allocation = await Allocation.findById(allocationId).populate('booth');
  if (!allocation) {
    const error = new Error('Allocation not found');
    error.statusCode = 404;
    throw error;
  }
  if (allocation.status === STATUS.CANCELLED) {
    return { changed: false, message: 'Allocation is already cancelled', allocation };
  }
  if (allocation.status !== STATUS.ALLOCATED) {
    const error = new Error('Only an ALLOCATED allocation can be cancelled');
    error.statusCode = 400;
    throw error;
  }

  allocation.status = STATUS.CANCELLED;
  allocation.cancelledAt = new Date();
  allocation.adminApproved = false;
  await allocation.save();

  // Recalculate booth count from the remaining active allocations.
  if (allocation.booth) {
    await countService.recalculateBoothCounts(allocation.booth._id);
  }

  return { changed: true, message: 'Allocation cancelled successfully', allocation };
}

// ---------------------------------------------------------------------------
// Best-effort MongoDB transaction (falls back to sequential execution when the
// deployment is a standalone MongoDB without replica-set transaction support).
// ---------------------------------------------------------------------------

async function runInTransaction(fn) {
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch {
    return fn();
  }
  try {
    return await session.withTransaction(async () => fn());
  } catch (error) {
    const text = `${error.message || ''} ${error.errmsg || ''}`;
    if (/transaction numbers are only allowed on a replica set member or mongos/i.test(text)) {
      try {
        await session.abortTransaction();
      } catch {
        /* ignore */
      }
      return fn();
    }
    throw error;
  } finally {
    try {
      await session.endSession();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Reallocate officer
// ---------------------------------------------------------------------------

async function reallocateOfficer(allocationId, preferredBoothId = null) {
  const current = await Allocation.findById(allocationId)
    .populate('officer')
    .populate('booth');
  if (!current) {
    const error = new Error('Allocation not found');
    error.statusCode = 404;
    throw error;
  }
  if (current.status !== STATUS.ALLOCATED) {
    const error = new Error('Only an ALLOCATED allocation can be reallocated');
    error.statusCode = 400;
    throw error;
  }
  const officer = current.officer;
  if (!officer) {
    const error = new Error('Officer record missing on this allocation');
    error.statusCode = 404;
    throw error;
  }

  const suitableBooths = await findSuitableBoothsForOfficer(officer);
  let chosen = null;
  if (preferredBoothId) {
    chosen = suitableBooths.find((b) => String(b._id) === String(preferredBoothId)) || null;
    if (!chosen) {
      const error = new Error('Preferred booth is not suitable or has no available capacity');
      error.statusCode = 409;
      throw error;
    }
  } else {
    // Prefer the booth with the fewest allocated officers (balanced).
    const alternatives = suitableBooths.filter((b) => String(b._id) !== String(current.booth?._id));
    alternatives.sort(
      (a, b) => a.allocatedOfficerCount - b.allocatedOfficerCount || String(a._id).localeCompare(String(b._id))
    );
    chosen = alternatives[0] || null;
  }
  if (!chosen) {
    const error = new Error('No suitable alternative booth available for reallocation');
    error.statusCode = 409;
    throw error;
  }

  return runInTransaction(async () => {
    const oldBoothId = current.booth?._id || null;

    // Requirement F: the old allocation becomes REALLOCATED BEFORE the new one
    // becomes active, so the officer always has at most one active allocation.
    current.status = STATUS.REALLOCATED;
    current.reallocatedAt = new Date();
    current.adminApproved = false;
    await current.save();

    const existingActive = await Allocation.exists({ officer: officer._id, status: STATUS.ALLOCATED });
    if (existingActive) {
      const error = new Error('Officer already has an active allocation');
      error.statusCode = 409;
      throw error;
    }

    const newAllocation = await Allocation.create({
      allocationId: await nextAllocationId(officer),
      officer: officer._id,
      officerId: officer.officerId,
      booth: chosen._id,
      boothId: chosen.boothId,
      mandal: officer.mandal || chosen.mandal || '',
      status: STATUS.ALLOCATED,
      allocationDate: new Date(),
      allocatedAt: new Date(),
      adminApproved: true,
      previousAllocationId: current._id,
      addressMatchScore: chosen.addressMatchScore || 0,
      addressValidationReason: chosen.reason || '',
      allocationReason: chosen.reason || '',
    });

    if (oldBoothId) {
      await countService.recalculateBoothCounts(oldBoothId);
    }
    await countService.recalculateBoothCounts(chosen._id);

    return { changed: true, newAllocation, oldAllocation: current, chosenBooth: chosen };
  });
}

/** Builds rich allocation rows (officer + booth populated) for tables/reports. */
async function getAllocationRows(filter = {}) {
  return Allocation.find(filter)
    .populate('officer')
    .populate('booth')
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = {
  STATUS,
  makeAllocationId,
  nextAllocationId,
  scoreSuitability,
  runAllocation,
  cancelAllocation,
  reallocateOfficer,
  findSuitableBoothsForOfficer,
  getAllocationRows,
};
