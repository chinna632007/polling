/**
 * countService.js
 * ===============
 * Single source of truth for booth capacity counters AND the central booth
 * capacity validator used by EVERY allocation path (automatic allocation,
 * manual allocation, reallocation, direct API calls).
 *
 * MongoDB allocation records are the authority: allocatedOfficerCount is
 * ALWAYS recomputed from the live Allocation documents (status ALLOCATED)
 * and availableSlots is derived as requiredOfficers - allocatedOfficerCount.
 *
 * availableSlots can NEVER become negative (Math.max(0, ...)).
 * allocatedOfficerCount stores the ACTUAL number of ALLOCATED allocation
 * documents, so over-allocated booths can be detected and reported instead
 * of being silently hidden.
 */

const Allocation = require('../models/Allocation');
const Booth = require('../models/Booth');

const ACTIVE_STATUS = 'ALLOCATED';

/** Creates an HTTP-friendly error (409 Conflict) with capacity details. */
function capacityError(message, details) {
  const error = new Error(message);
  error.statusCode = 409;
  error.details = details;
  return error;
}

/** Creates an HTTP-friendly 404 error. */
function notFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

/** Maps boothId -> number of live (ALLOCATED) allocation documents. */
async function computeBoothCountsMap(session = null) {
  const aggregate = Allocation.aggregate([
    { $match: { status: ACTIVE_STATUS, booth: { $ne: null } } },
    { $group: { _id: '$booth', count: { $sum: 1 } } },
  ]);
  const rows = session ? await aggregate.session(session) : await aggregate;
  const map = new Map();
  rows.forEach((r) => map.set(String(r._id), r.count));
  return map;
}

/** Live allocated count for a single booth (from allocation documents). */
async function getLiveAllocatedCount(boothId, session = null) {
  if (!boothId) return 0;
  return Allocation.countDocuments(
    { booth: boothId, status: ACTIVE_STATUS },
    { session: session || undefined }
  );
}

/**
 * CENTRAL booth capacity validator (database is the source of truth).
 *
 * Accepts a Booth _id (ObjectId / string) or an already-loaded booth document.
 * NEVER trusts stored booth counters - always counts the real Allocation
 * documents where status = 'ALLOCATED'.
 *
 * Returns:
 *   {
 *     allowed,                 true when allocatedOfficerCount < requiredOfficers
 *     requiredOfficers,
 *     allocatedOfficerCount,   actual active allocations (from the DB)
 *     availableSlots,          Math.max(0, required - allocated) - never negative
 *     isFull,                  allocatedOfficerCount >= requiredOfficers
 *     overAllocated,           allocatedOfficerCount > requiredOfficers (bad data)
 *     boothId, boothCode, boothNumber, boothName, mandal
 *   }
 */
async function checkBoothCapacity(boothRef, options = {}) {
  const session = options.session || null;
  // A loaded booth document has _id AND its schema fields. NOTE: a BSON
  // ObjectId also exposes a truthy `_id` (itself), so checking only `_id`
  // would wrongly treat an ObjectId as a document and lose every field.
  const isDocument = Boolean(
    boothRef &&
      typeof boothRef === 'object' &&
      boothRef._id &&
      (boothRef.requiredOfficers !== undefined ||
        boothRef.boothNumber !== undefined ||
        boothRef.boothId !== undefined)
  );
  let booth;
  if (isDocument) {
    booth = boothRef;
  } else {
    const query = Booth.findById(boothRef);
    booth = await (session ? query.session(session) : query).lean();
  }
  if (!booth) {
    throw notFoundError('Booth not found');
  }

  const requiredOfficers = Math.max(0, Number(booth.requiredOfficers) || 0);
  const allocatedOfficerCount = await getLiveAllocatedCount(booth._id, session);
  const availableSlots = Math.max(0, requiredOfficers - allocatedOfficerCount);

  return {
    allowed: allocatedOfficerCount < requiredOfficers,
    requiredOfficers,
    allocatedOfficerCount,
    availableSlots,
    isFull: allocatedOfficerCount >= requiredOfficers,
    overAllocated: allocatedOfficerCount > requiredOfficers,
    boothId: booth._id,
    boothCode: booth.boothId || '',
    boothNumber: booth.boothNumber || '',
    boothName: booth.boothName || '',
    mandal: booth.mandal || '',
  };
}

/**
 * CENTRAL capacity guard - throws a 409 error when the booth has no free
 * slot. Used by automatic allocation, manual allocation and reallocation
 * immediately BEFORE any allocation record is created.
 */
async function assertBoothHasCapacity(boothRef, options = {}) {
  const capacity = await checkBoothCapacity(boothRef, options);
  if (capacity.overAllocated) {
    throw capacityError(
      `Booth ${capacity.boothNumber || capacity.boothCode} is over-allocated ` +
        `(required officers: ${capacity.requiredOfficers}, allocated officers: ${capacity.allocatedOfficerCount}). ` +
        'Run the capacity repair before allocating more officers.',
      capacity
    );
  }
  if (!capacity.allowed) {
    throw capacityError(
      `Booth ${capacity.boothNumber || capacity.boothCode} has reached its required officer capacity.`,
      capacity
    );
  }
  return capacity;
}

/**
 * Recalculates a single booth's counters from the actual active allocations:
 *   allocatedOfficerCount = number of Allocation docs (status ALLOCATED)
 *   availableSlots        = Math.max(0, requiredOfficers - allocatedOfficerCount)
 * allocatedOfficerCount keeps the ACTUAL value (no clamping) so over-allocated
 * booths stay visible; availableSlots is always clamped >= 0.
 */
async function recalculateBoothCounts(boothId, session = null) {
  if (!boothId) {
    return { allocatedOfficerCount: 0, availableSlots: 0, requiredOfficers: 0, overAllocated: false };
  }
  const query = Booth.findById(boothId);
  const booth = await (session ? query.session(session) : query).lean();
  if (!booth) {
    return { allocatedOfficerCount: 0, availableSlots: 0, requiredOfficers: 0, overAllocated: false };
  }
    const requiredOfficers = Math.max(0, Number(booth.requiredOfficers) || 0);
  const allocatedOfficerCount = await getLiveAllocatedCount(booth._id, session);
  const availableSlots = Math.max(0, requiredOfficers - allocatedOfficerCount);
  await Booth.updateOne(
    { _id: booth._id },
    { $set: { allocatedOfficerCount, availableSlots } },
    { session: session || undefined }
  );
  return {
    boothId: booth._id,
    boothCode: booth.boothId || '',
    boothNumber: booth.boothNumber || '',
    boothName: booth.boothName || '',
    mandal: booth.mandal || '',
    allocatedOfficerCount,
    availableSlots,
    requiredOfficers,
    overAllocated: allocatedOfficerCount > requiredOfficers,
  };
}

/**
 * Rebuilds every booth's counters from the allocation collection (actual
 * counts, no clamping) and reports over-allocated booths found.
 */
async function resyncAllBoothCounts(session = null) {
  const map = await computeBoothCountsMap(session);
  const booths = await Booth.find({})
    .select('_id boothId boothNumber requiredOfficers allocatedOfficerCount availableSlots')
    .lean();
  let updated = 0;
  const overAllocated = [];
  for (const booth of booths) {
    const requiredOfficers = Math.max(0, Number(booth.requiredOfficers) || 0);
    const allocatedOfficerCount = map.get(String(booth._id)) || 0;
    const availableSlots = Math.max(0, requiredOfficers - allocatedOfficerCount);
    if (allocatedOfficerCount > requiredOfficers) {
      overAllocated.push({
        boothId: booth._id,
        boothCode: booth.boothId,
        boothNumber: booth.boothNumber,
        requiredOfficers,
        actualAllocatedOfficers: allocatedOfficerCount,
        excessOfficers: allocatedOfficerCount - requiredOfficers,
      });
    }
    if (booth.allocatedOfficerCount !== allocatedOfficerCount || booth.availableSlots !== availableSlots) {
      await Booth.updateOne(
        { _id: booth._id },
        { $set: { allocatedOfficerCount, availableSlots } },
        { session: session || undefined }
      );
      updated += 1;
    }
  }
  return { booths: booths.length, updated, overAllocated };
}

/**
 * Data-safety report: every booth whose ACTUAL active allocations exceed its
 * requiredOfficers. Over-allocated data is never silently ignored.
 */
async function findOverAllocatedBooths() {
  const map = await computeBoothCountsMap();
  const booths = await Booth.find({})
    .select('_id boothId boothNumber boothName mandal requiredOfficers allocatedOfficerCount')
    .lean();
  const over = [];
  for (const booth of booths) {
    const requiredOfficers = Math.max(0, Number(booth.requiredOfficers) || 0);
    const actualAllocatedOfficers = map.get(String(booth._id)) || 0;
    if (actualAllocatedOfficers > requiredOfficers) {
      over.push({
        _id: booth._id,
        boothId: booth.boothId,
        boothNumber: booth.boothNumber,
        boothName: booth.boothName,
        mandal: booth.mandal || '',
        requiredOfficers,
        actualAllocatedOfficers,
        storedAllocatedOfficerCount: booth.allocatedOfficerCount || 0,
        excessOfficers: actualAllocatedOfficers - requiredOfficers,
      });
    }
  }
  return over;
}

module.exports = {
  ACTIVE_STATUS,
  capacityError,
  notFoundError,
  computeBoothCountsMap,
  getLiveAllocatedCount,
  checkBoothCapacity,
  assertBoothHasCapacity,
  recalculateBoothCounts,
  resyncAllBoothCounts,
  findOverAllocatedBooths,
};
