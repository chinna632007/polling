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
 *        - available capacity (verified against the DATABASE, not a cache)
 *        - NOT related to the officer's residential locality
 *   5. Choose the booth with the LOWEST allocation ratio
 *      (allocatedOfficerCount / requiredOfficers) for balanced distribution,
 *      then most available slots, then booth number ascending.
 *   6. Re-verify the booth capacity against the database immediately before
 *      creating the allocation, then create it (status ALLOCATED) and
 *      recalculate the booth counters from the real allocation documents.
 *      A compensating guard cancels the just-created allocation if a
 *      concurrent write pushed the booth over its required officers, so
 *      allocatedOfficerCount > requiredOfficers can NEVER persist.
 *   7. Report unallocated officers with a clear reason.
 */

const mongoose = require('mongoose');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');
const countService = require('./countService');
const { compareOfficerIds, compareBoothIds, sortByBoothId } = require('../utils/naturalSort');
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
 * Booth suitability score:
 *   - dominant term prefers booths with the LOWEST allocation ratio
 *     (allocatedOfficerCount / requiredOfficers) so distribution stays
 *     balanced even when booth capacities differ
 *   - small bonus for a different ward (secondary rule only)
 *   - small bonus for remaining capacity
 */
function scoreSuitability(officer, booth, capacity) {
  const check = isRelated(officer, booth);
  if (check.related) return { suitable: false, score: -Infinity, check };

  let score = 0;
  const required = Math.max(0, booth.requiredOfficers || 0);
  const current = Math.max(0, booth.allocatedOfficerCount || 0);
  const ratio = required > 0 ? current / required : 1; // 0 = empty, 1 = full
  score += 1000 * (1 - ratio); // primary rule: prefer lowest allocation ratio

  const officerWard = normalizeAddress(officer.ward);
  const boothWard = normalizeAddress(booth.ward);
  if (officerWard && boothWard && officerWard !== boothWard) score += 10;

  score += Math.min(Math.max(0, capacity || 0), 5) * 2;
  return { suitable: true, score, check };
}

/**
 * Deterministic booth-choice ranking used by the automatic engine:
 *   1. lowest allocation ratio (allocated / required)  -> balanced
 *   2. more available slots
 *   3. booth number ascending (natural order)
 *   4. _id as the final deterministic tie-break
 */
function compareBoothChoices(a, b) {
  const requiredA = Math.max(0, a.required || 0);
  const requiredB = Math.max(0, b.required || 0);
  const ratioA = requiredA > 0 ? (a.allocated || 0) / requiredA : 1;
  const ratioB = requiredB > 0 ? (b.allocated || 0) / requiredB : 1;
  if (ratioA !== ratioB) return ratioA - ratioB;
  const slotsA = Math.max(0, a.available || 0);
  const slotsB = Math.max(0, b.available || 0);
  if (slotsA !== slotsB) return slotsB - slotsA; // more free slots first
  const byNumber = compareBoothIds(a.booth?.boothNumber, b.booth?.boothNumber);
  if (byNumber !== 0) return byNumber;
  return String(a.booth?._id || '').localeCompare(String(b.booth?._id || ''));
}

/** Public capacity snapshot for API responses (spec: booth allocation response). */
async function boothCapacitySnapshot(boothRef) {
  try {
    const c = await countService.checkBoothCapacity(boothRef);
    return {
      boothId: c.boothId,
      boothCode: c.boothCode,
      boothNumber: c.boothNumber,
      requiredOfficers: c.requiredOfficers,
      allocatedOfficerCount: c.allocatedOfficerCount,
      availableSlots: c.availableSlots,
      isFull: c.isFull,
      overAllocated: c.overAllocated,
    };
  } catch {
    return null;
  }
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
      isFull: availableSlots <= 0,
      allocationRatio: required > 0 ? live / required : 1,
      addressMatchScore: Math.max(0, Math.round(check.score)),
      reason: compatibilityReason(officer, booth),
    });
  }
  // Booth number ascending (natural: PB2 before PB10).
  return sortByBoothId(result);
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
          // Clamp against the live DB-derived count: never trust stale counters.
          const live = Math.min(liveCounts.get(String(booth._id)) || 0, required);
          const available = Math.max(0, required - live);
          if (available <= 0) continue; // booth capacity is already reached
          const evalResult = scoreSuitability(officer, { ...booth, allocatedOfficerCount: live }, available);
          if (!evalResult.suitable) continue;
          candidates.push({
            booth,
            required,
            allocated: live,
            available,
            score: evalResult.score,
            check: evalResult.check,
          });
        }

        if (candidates.length === 0) {
          result.unallocated += 1;
          result.unallocatedOfficers.push({
            ...officerToUnallocatedRow(officer),
            reason: pickUnallocatedReason(officer, mandalBooths, liveCounts),
          });
          continue;
        }

        // Balanced choice: lowest allocation ratio first, then most free
        // slots, then booth number ascending (deterministic).
        candidates.sort(compareBoothChoices);
        // Deterministic choice: candidates were sorted with the lowest
        // allocation ratio first (balanced distribution requirement).
        const best = candidates[0];


        // Final safety check: still no active allocation for this officer.
        const already = await Allocation.exists({ officer: officer._id, status: STATUS.ALLOCATED });
        if (already) {
          result.skipped += 1;
          continue;
        }

        // Spec requirement: re-check the ACTUAL database count immediately
        // before creating the allocation (booth may have filled concurrently).
        try {
          await countService.assertBoothHasCapacity(best.booth._id);
        } catch (capacityErr) {
          result.unallocated += 1;
          result.unallocatedOfficers.push({
            ...officerToUnallocatedRow(officer),
            reason: `All suitable booths are full. ${capacityErr.message}`,
          });
          continue;
        }

        let allocation;
        try {
          allocation = await Allocation.create({
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
        } catch (createError) {
          // Duplicate key => the officer got an active allocation from a
          // concurrent write (unique partial index). Treat as already allocated.
          if (createError && createError.code === 11000) {
            result.skipped += 1;
            continue;
          }
          throw createError;
        }

        // Compensating guard: re-verify against the DATABASE immediately after
        // the create. If a concurrent write pushed the booth over its
        // required officers, cancel the just-created allocation so
        // allocatedOfficerCount > requiredOfficers can never persist.
        const liveNow = await countService.getLiveAllocatedCount(best.booth._id);
        if (liveNow > best.required) {
          allocation.status = STATUS.CANCELLED;
          allocation.cancelledAt = new Date();
          allocation.adminApproved = false;
          allocation.allocationReason =
            'Automatic guard: booth capacity exceeded by a concurrent write';
          await allocation.save();
          await countService.recalculateBoothCounts(best.booth._id);
          result.unallocated += 1;
          result.unallocatedOfficers.push({
            ...officerToUnallocatedRow(officer),
            reason: 'Booth capacity was exceeded by a concurrent write - please retry allocation.',
          });
          continue;
        }

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

  // Recalculate booth count from the remaining active allocations - the booth
  // immediately gets its free slot back.
  let booth = null;
  if (allocation.booth) {
    booth = await countService.recalculateBoothCounts(allocation.booth._id);
  }

  return { changed: true, message: 'Allocation cancelled successfully', allocation, booth };
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
      // Give the admin a precise reason: full booth vs unsuitable booth.
      const BoothDoc = require('../models/Booth');
      const preferredBooth = await BoothDoc.findById(preferredBoothId).lean().catch(() => null);
      if (preferredBooth) {
        const capacity = await countService.checkBoothCapacity(preferredBooth._id);
        if (!capacity.allowed) {
          const error = new Error(
            `Cannot reallocate: this booth is already full. Required officers: ${capacity.requiredOfficers}, ` +
              `Allocated officers: ${capacity.allocatedOfficerCount}. The officer's current allocation is unchanged.`
          );
          error.statusCode = 409;
          error.details = capacity;
          throw error;
        }
        const error = new Error(
          "Preferred booth is not suitable (different Mandal or related to the officer's residential locality). " +
            "The officer's current allocation is unchanged."
        );
        error.statusCode = 409;
        throw error;
      }
      const error = new Error('Preferred booth not found');
      error.statusCode = 404;
      throw error;
    }
  } else {
    // Balanced auto-choice: lowest allocation ratio, then most free slots,
    // then booth number ascending.
    const alternatives = suitableBooths
      .filter((b) => String(b._id) !== String(current.booth?._id))
      .map((b) => ({
        booth: b,
        required: b.requiredOfficers || 0,
        allocated: b.allocatedOfficerCount || 0,
        available: b.availableSlots || 0,
      }));
    alternatives.sort(compareBoothChoices);
    chosen = alternatives[0]?.booth || null;
  }
  if (!chosen) {
    const error = new Error('No suitable alternative booth available for reallocation');
    error.statusCode = 409;
    throw error;
  }

  // STEP 1 (spec): verify the NEW booth has capacity BEFORE changing the old
  // allocation. If the new booth is full, stop - the old allocation is NOT
  // modified.
  try {
    await countService.assertBoothHasCapacity(chosen._id);
  } catch (capacityError) {
    capacityError.message =
      `Cannot reallocate: ${capacityError.message} The officer's current allocation is unchanged.`;
    throw capacityError;
  }

  return runInTransaction(async () => {
    const oldBoothId = current.booth?._id || null;

    // STEP 1 again inside the write path (concurrency safety): re-check the
    // actual active allocation count of the NEW booth before any change.
    await countService.assertBoothHasCapacity(chosen._id);

    // STEP 3: the old allocation becomes REALLOCATED only after the new
    // booth's capacity is confirmed, so the officer always has at most one
    // active allocation.
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

    // STEP 4: create the new allocation with status ALLOCATED.
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

    // Compensating guard: if a concurrent write filled the booth between the
    // check and the create, undo completely (cancel the new allocation and
    // restore the old one) so capacity limits can never be exceeded.
    const liveNow = await countService.getLiveAllocatedCount(chosen._id);
    const requiredOfficers = Math.max(0, Number(chosen.requiredOfficers) || 0);
    if (liveNow > requiredOfficers) {
      await Allocation.deleteOne({ _id: newAllocation._id });
      current.status = STATUS.ALLOCATED;
      current.reallocatedAt = null;
      current.adminApproved = true;
      await current.save();
      const error = new Error(
        'Cannot reallocate: this booth is already full (capacity changed during the operation). ' +
          "The officer's current allocation is unchanged."
      );
      error.statusCode = 409;
      throw error;
    }

    // STEP 5: recalculate BOTH booth counts (old booth + new booth).
    if (oldBoothId) {
      await countService.recalculateBoothCounts(oldBoothId);
    }
    const boothSnapshot = await countService.recalculateBoothCounts(chosen._id);

    return { changed: true, newAllocation, oldAllocation: current, chosenBooth: chosen, booth: boothSnapshot };
  });
}

// ---------------------------------------------------------------------------
// Manual allocation (admin picks the booth explicitly)
// ---------------------------------------------------------------------------

/** Resolves an officer by Mongo _id or by unique officerId code (case-insensitive). */
async function resolveOfficer(officerRef) {
  const value = String(officerRef || '').trim();
  if (!value) return null;
  let officer = null;
  if (mongoose.isValidObjectId(value)) {
    officer = await Officer.findById(value);
  }
  if (!officer) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    officer = await Officer.findOne({ officerId: new RegExp(`^${escaped}$`, 'i') });
  }
  return officer;
}

/** Resolves a booth by Mongo _id or by unique boothId code (case-insensitive). */
async function resolveBooth(boothRef) {
  const value = String(boothRef || '').trim();
  if (!value) return null;
  let booth = null;
  if (mongoose.isValidObjectId(value)) {
    booth = await Booth.findById(value);
  }
  if (!booth) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    booth = await Booth.findOne({ boothId: new RegExp(`^${escaped}$`, 'i') });
  }
  return booth;
}

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

/**
 * Manual allocation with the FULL capacity validation chain:
 *   1. booth exists            4. booth active
 *   2. officer exists          5. same Mandal
 *   3. officer active          6. officer has no active allocation
 *   7. booth has capacity (actual DB count < requiredOfficers)
 * The capacity is re-verified inside the write path and a compensating
 * guard undoes the allocation if a concurrent write filled the last slot.
 */
async function manualAllocate(officerRef, boothRef, adminId = null) {
  // 1 + 2: officer / booth existence.
  const officer = await resolveOfficer(officerRef);
  if (!officer) throw httpError(404, `Officer '${officerRef}' not found`);
  const booth = await resolveBooth(boothRef);
  if (!booth) throw httpError(404, `Booth '${boothRef}' not found`);

  // 3 + 4: both records must be active.
  if (officer.isActive === false) {
    throw httpError(400, `Officer '${officer.officerId}' is inactive and cannot be allocated`);
  }
  if (booth.isActive === false) {
    throw httpError(400, `Booth ${booth.boothNumber} (${booth.boothId}) is inactive`);
  }

  // 5: same Mandal rule (allocation engine never crosses Mandals).
  if (mandalKey(officer.mandal) !== mandalKey(booth.mandal)) {
    throw httpError(
      400,
      `Officer '${officer.officerId}' belongs to Mandal '${officer.mandal || 'Unspecified'}' but booth ` +
        `${booth.boothNumber} is in Mandal '${booth.mandal || 'Unspecified'}'. ` +
        'Manual allocation must stay within the same Mandal.'
    );
  }

  // 6: one active allocation per officer.
  const alreadyActive = await Allocation.exists({
    officer: officer._id,
    status: STATUS.ALLOCATED,
  });
  if (alreadyActive) {
    throw httpError(
      409,
      `Officer '${officer.officerId}' already has an active allocation. Cancel or reallocate it first.`
    );
  }

  // 7: capacity check against the actual DB allocations (NOT the stored counter).
  const capacity = await countService.checkBoothCapacity(booth._id);
  if (!capacity.allowed) {
    throw httpError(
      409,
      capacity.overAllocated
        ? `Booth ${capacity.boothNumber} is over-allocated (required officers: ${capacity.requiredOfficers}, ` +
            `allocated officers: ${capacity.allocatedOfficerCount}). Run the capacity repair first.`
        : `This booth is already full. Required officers: ${capacity.requiredOfficers}, ` +
            `Allocated officers: ${capacity.allocatedOfficerCount}.`,
      capacity
    );
  }

  return runInTransaction(async () => {
    // Re-verify capacity inside the write path (concurrency safety).
    await countService.assertBoothHasCapacity(booth._id);

    let newAllocation;
    try {
      newAllocation = await Allocation.create({
        allocationId: await nextAllocationId(officer),
        officer: officer._id,
        officerId: officer.officerId,
        booth: booth._id,
        boothId: booth.boothId,
        mandal: officer.mandal || booth.mandal || '',
        status: STATUS.ALLOCATED,
        allocationDate: new Date(),
        allocatedAt: new Date(),
        adminApproved: true,
        allocatedBy: adminId || undefined,
        addressMatchScore: 0,
        addressValidationReason: 'Manual allocation by admin (locality rule overridden)',
        allocationReason: 'Manual allocation by admin',
      });
    } catch (createError) {
      if (createError && createError.code === 11000) {
        throw httpError(
          409,
          `Officer '${officer.officerId}' already has an active allocation (concurrent write detected).`
        );
      }
      throw createError;
    }

    // Compensating guard: never persist an allocation that exceeds capacity.
    const liveNow = await countService.getLiveAllocatedCount(booth._id);
    const requiredOfficers = Math.max(0, Number(booth.requiredOfficers) || 0);
    if (liveNow > requiredOfficers) {
      await Allocation.deleteOne({ _id: newAllocation._id });
      throw httpError(
        409,
        'This booth is already full (capacity changed during the operation). No allocation was made.'
      );
    }

    const boothSnapshot = await countService.recalculateBoothCounts(booth._id);
    return { allocation: newAllocation, booth: boothSnapshot, changed: true };
  });
}

/** Builds rich allocation rows (officer + booth populated) for tables/reports. */
async function getAllocationRows(filter = {}) {
  const rows = await Allocation.find(filter)
    .populate('officer')
    .populate('booth')
    .sort({ createdAt: -1 })
    .lean();
  // Officer ID ascending (natural numeric order: OFF1 < OFF2 < OFF10).
  return rows.sort((a, b) =>
    compareOfficerIds(
      a.officer?.officerId || a.officerId || '',
      b.officer?.officerId || b.officerId || ''
    )
  );
}

module.exports = {
  STATUS,
  makeAllocationId,
  nextAllocationId,
  scoreSuitability,
  compareBoothChoices,
  runAllocation,
  cancelAllocation,
  reallocateOfficer,
  manualAllocate,
  resolveOfficer,
  resolveBooth,
  findSuitableBoothsForOfficer,
  boothCapacitySnapshot,
  getAllocationRows,
};
