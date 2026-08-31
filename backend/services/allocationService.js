/**
 * allocationService.js
 * =====================
 * Complete polling-booth officer allocation algorithm.
 *
 * Steps implemented (from the project specification):
 *   Step 1: Group booths by Mandal.
 *   Step 2: Group officers by Mandal.
 *   Step 3: Find booths with available officer capacity.
 *   Step 4: Check every possible booth for the officer.
 *   Step 5: Reject booths where the officer address is related to the booth locality.
 *   Step 6: Score suitable booths (locality difference, ward difference, capacity).
 *   Step 7: Allocate the officer to the best suitable booth.
 *   Step 8: Mark officers that cannot be allocated.
 *   Step 9: Save all allocation results to MongoDB.
 */

const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');
const {
  mandalKey,
  normalizeAddress,
  isRelated,
  boothAddressLine,
} = require('./addressMatchingService');

const STATUS = {
  ALLOCATED: 'Allocated',
  PENDING: 'Pending Approval',
  UNALLOCATED: 'Unallocated',
  CANCELLED: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Deterministic allocationId: ALLOC-YYYYMMDD-<officerId> */
function makeAllocationId(officer) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `ALLOC-${ymd}-${String(officer.officerId).toUpperCase()}`;
}
/**
 * Uniquifies the deterministic base ID. Cancelled allocations keep their
 * allocationId forever, so a re-allocation of the same officer on the same
 * day must never reuse it: we append -2, -3, ... until the ID is free.
 */
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

/** Groups a list of documents by a key function. */

/** Groups a list of documents by a key function. */
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
 * Step 6 - suitability scoring.
 * Produces a score for a booth given an officer. Yardsticks:
 *   + different ward from the officer       -> safer, score up
 *   + more remaining capacity               -> helps balance, score up
 *   + no shared locality tokens             -> safer, score up
 *   - leftover conflict score (below reject threshold) -> score down
 */
function scoreSuitability(officer, booth, capacity) {
  const check = isRelated(officer, booth);
  if (check.related) {
    return { suitable: false, score: -Infinity, check };
  }

  let score = 0;

  // Ward difference: allocating within the same ward is discouraged because
  // the officer is more likely to be personally known / related there.
  const officerWard = normalizeAddress(officer.ward);
  const boothWard = normalizeAddress(booth.ward);
  if (officerWard && boothWard && officerWard !== boothWard) {
    score += 40;
  }

  // Capacity bonus: prefer the booth that still needs officers the most,
  // which balances the load across every booth (rule 11).
  score += Math.min(Math.max(capacity, 0), 5) * 6; // 6 .. 30

  // No shared locality/street/ward tokens -> genuinely distinct address.
  if (check.matchedTokens.length === 0) {
    score += 15;
  }

  // Any residual conflict signals reduce the score.
  score -= check.score * 0.25;

  return { suitable: true, score: Math.max(0, score), check };
}
// ---------------------------------------------------------------------------
// Step 1-9 : main algorithm
// ---------------------------------------------------------------------------

/**
 * Runs the full allocation algorithm.
 *
 * Safety guarantees:
 *  - One active allocation per officer (existing allocations are never
 *    overwritten - rule 12).
 *  - Booth capacity is reserved atomically via a conditional update so two
 *    concurrent runs can never over-allocate (rule 10).
 *  - Re-running is safe: already allocated officers are reported as skipped.
 *
 * @returns {Promise<object>} summary counters plus created allocation docs.
 */
async function runAllocation() {
  try {
    // Step 1: load booths and group by Mandal.
    const booths = await Booth.find().lean();
    const boothsByMandal = groupBy(booths, (b) => mandalKey(b.mandal));

    // Step 2: load officers and group by Mandal.
    const officers = await Officer.find().lean();
    const officersByMandal = groupBy(officers, (o) => mandalKey(o.mandal));

    // Officers who already hold a live allocation are never re-processed.
    const existingAllocs = await Allocation.find({
      status: { $ne: STATUS.CANCELLED },
    })
      .select('officer')
      .lean();
    const alreadyAllocated = new Set(existingAllocs.map((a) => String(a.officer)));

    // In-memory mirror of booth.allocatedOfficerCount so capacity decisions
    // stay correct without re-querying after every single allocation.
    const liveCapacity = new Map();
    booths.forEach((b) =>
      liveCapacity.set(String(b._id), Math.max(0, b.requiredOfficers - b.allocatedOfficerCount))
    );

    const createdAllocations = [];
    const summary = {
      allocated: 0,
      unallocated: 0,
      skipped: 0,
      boothsWithoutCapacity: 0,
      totalOfficers: officers.length,
      totalBooths: booths.length,
      noBoothMandal: 0, // officers whose mandal has no booths at all
    };
// Steps 2..9: process one Mandal at a time so officers stay inside
    // their own Mandal (rule 1).
    for (const [mKey, mandalOfficers] of officersByMandal.entries()) {
      const mandalBooths = boothsByMandal.get(mKey) || [];
      if (mandalBooths.length === 0) summary.noBoothMandal += mandalOfficers.length;

      for (const officer of mandalOfficers) {
        // Rule 12: one officer = one allocation. Skip whoever already has one.
        if (alreadyAllocated.has(String(officer._id))) {
          summary.skipped += 1;
          continue;
        }

        // Step 3+4: consider every booth in the mandal with free capacity.
        // Booth order is deterministic for repeatable results.
        const candidates = mandalBooths
          .map((booth) => ({
            booth,
            capacity: liveCapacity.get(String(booth._id)) || 0,
          }))
          .filter((c) => c.capacity > 0)
          .sort((a, b) => String(a.booth.boothId).localeCompare(String(b.booth.boothId)));

        // Step 5+6: evaluate each candidate and keep the best one.
        let best = null; // { booth, check, score }
        for (const { booth, capacity } of candidates) {
          const evalResult = scoreSuitability(officer, booth, capacity);
          if (!evalResult.suitable) continue; // Step 5: address conflict rejected
          if (!best || evalResult.score > best.score) {
            best = { booth, check: evalResult.check, score: evalResult.score };
          }
        }

        if (!best) {
          // Step 8: no suitable booth -> mark the officer as Unallocated.
          const alloc = await Allocation.create({
            allocationId: await nextAllocationId(officer),
            officer: officer._id,
            booth: null,
            mandal: officer.mandal || '',
            status: STATUS.UNALLOCATED,
            addressMatchScore: 0,
            rejectedReasons: ['No suitable booth available in the officer Mandal'],
          });
          createdAllocations.push(alloc);
          alreadyAllocated.add(String(officer._id));
          summary.unallocated += 1;
          continue;
        }
// Step 7: reserve capacity atomically. If a concurrent run has just
        // filled the booth, the conditional update matches 0 documents and we
        // skip this booth (its capacity is treated as consumed).
        const reserve = await Booth.updateOne(
          {
            _id: best.booth._id,
            allocatedOfficerCount: { $lt: best.booth.requiredOfficers },
          },
          { $inc: { allocatedOfficerCount: 1 } }
        );

        if (reserve.matchedCount === 0) {
          liveCapacity.set(String(best.booth._id), 0);
          summary.boothsWithoutCapacity += 1;
          continue;
        }

        liveCapacity.set(
          String(best.booth._id),
          (liveCapacity.get(String(best.booth._id)) || 0) - 1
        );

        // Step 9: save the allocation. New allocations start as
        // "Pending Approval"; the admin approves them afterwards.
        const alloc = await Allocation.create({
          allocationId: await nextAllocationId(officer),
          officer: officer._id,
          booth: best.booth._id,
          mandal: officer.mandal || best.booth.mandal || '',
          status: STATUS.PENDING,
          allocationDate: new Date(),
          addressMatchScore: best.check.score,
          rejectedReasons: best.check.related ? best.check.reasons : [],
        });

        createdAllocations.push(alloc);
        alreadyAllocated.add(String(officer._id));
        summary.allocated += 1;
      }
    }

    return { ...summary, allocations: createdAllocations };
  } catch (error) {
    throw new Error(`Allocation run failed: ${error.message}`);
  }
}
/**
 * Cancels an allocation and frees the booth slot it was holding.
 * @param {string} allocationId - _id of the Allocation document
 */
async function cancelAllocation(allocationId) {
  const allocation = await Allocation.findById(allocationId).populate('booth');
  if (!allocation) throw new Error('Allocation not found');
  if (allocation.status === STATUS.CANCELLED) {
    return { changed: false, message: 'Allocation already cancelled' };
  }

  if (allocation.booth) {
    await Booth.updateOne(
      { _id: allocation.booth._id },
      { $inc: { allocatedOfficerCount: -1 } }
    );
  }

  allocation.status = STATUS.CANCELLED;
  allocation.adminApproved = false;
  allocation.cancelledAt = new Date();
  await allocation.save();
  return { changed: true, allocation };
}

/**
 * Reallocates an officer to a new suitable booth.
 *  1. Cancels the current allocation (freeing its booth slot).
 *  2. Optionally honours an explicitly requested boothId.
 *  3. Otherwise automatically picks the best suitable booth in the officer's
 *     Mandal using the same scoring as the main algorithm.
 *
 * @param {string} allocationId - _id of the Allocation to reallocate
 * @param {string|null} preferredBoothId - optional forced booth _id
 * @returns {Promise<object>} the new allocation plus the cancelled one
 */
async function reallocateOfficer(allocationId, preferredBoothId = null) {
  const current = await Allocation.findById(allocationId)
    .populate('officer')
    .populate('booth');
  if (!current) throw new Error('Allocation not found');
  if (current.status === STATUS.UNALLOCATED) {
    const err = new Error('An Unallocated officer cannot be reallocated');
    err.statusCode = 400;
    throw err;
  }

  const officer = current.officer;
  const cancelledAllocation = (await cancelAllocation(allocationId)).allocation;

  const booths = await Booth.find({
    mandal: officer.mandal ? { $regex: new RegExp(`^${officer.mandal.trim()}$`, 'i') } : /.*/,
  }).lean();

  let chosen = null;
  if (preferredBoothId) {
    const forced = booths.find((b) => String(b._id) === String(preferredBoothId));
    if (!forced) {
      const err = new Error('Preferred booth not found in this Mandal');
      err.statusCode = 404;
      throw err;
    }
    const capacity = forced.requiredOfficers - forced.allocatedOfficerCount;
    if (capacity <= 0) {
      const err = new Error('Preferred booth has no remaining capacity');
      err.statusCode = 409;
      throw err;
    }
    const evalResult = scoreSuitability(officer, forced, capacity);
    if (!evalResult.suitable) {
      const err = new Error(
        `Preferred booth is not suitable (${evalResult.check.reasons.join('; ')})`
      );
      err.statusCode = 409;
      throw err;
    }
    chosen = { booth: forced, check: evalResult.check, score: evalResult.score };
  } else {
    // Auto pick: same evaluation loop as runAllocation.
    const candidates = booths
      .filter((b) => b.requiredOfficers - b.allocatedOfficerCount > 0)
      .filter((b) => String(b._id) !== String(current.booth?._id));
    for (const booth of candidates) {
      const capacity = booth.requiredOfficers - booth.allocatedOfficerCount;
      const evalResult = scoreSuitability(officer, booth, capacity);
      if (!evalResult.suitable) continue;
      if (!chosen || evalResult.score > chosen.score) {
        chosen = { booth, check: evalResult.check, score: evalResult.score };
      }
    }
    if (!chosen) {
      const err = new Error('No suitable alternative booth available for reallocation');
      err.statusCode = 409;
      throw err;
    }
  }

  await Booth.updateOne(
    { _id: chosen.booth._id, allocatedOfficerCount: { $lt: chosen.booth.requiredOfficers } },
    { $inc: { allocatedOfficerCount: 1 } }
  );

  const newAllocation = await Allocation.create({
    allocationId: await nextAllocationId(officer),
    officer: officer._id,
    booth: chosen.booth._id,
    mandal: officer.mandal || chosen.booth.mandal || '',
    status: STATUS.PENDING,
    allocationDate: new Date(),
    addressMatchScore: chosen.check.score,
    rejectedReasons: chosen.check.related ? chosen.check.reasons : [],
  });

  return { newAllocation, cancelledAllocation, score: chosen.check.score };
}

/** Builds rich allocation rows (officer + booth populated) for tables/reports. */
async function getAllocationRows(filter = {}) {
  const query = Allocation.find(filter)
    .populate('officer')
    .populate('booth')
    .sort({ createdAt: -1 });
  return query.lean();
}

module.exports = {
  STATUS,
  makeAllocationId,
  nextAllocationId,
  scoreSuitability,
  runAllocation,
  cancelAllocation,
  reallocateOfficer,
  getAllocationRows,
  boothAddressLine,
};