/**
 * capacity-test.js
 * ================
 * Database-backed verification of the booth capacity rules and the natural
 * Officer ID sorting. Requires a running MongoDB (same URI as the server).
 *
 * Covers the required tests:
 *   TEST 1: booth with requiredOfficers=3 accepts exactly 3 allocations,
 *           availableSlots becomes 0, and a 4th allocation FAILS.
 *   TEST 2: automatic allocation across booths with capacities 3/5/2 and more
 *           officers than total capacity - no booth exceeds its capacity.
 *   TEST 3: manual allocation into a full booth is REJECTED with a clear
 *           message.
 *   TEST 4: reallocating an officer into a full booth is REJECTED and the old
 *           allocation stays unchanged.
 *   TEST 5: cancelling an allocation frees the slot (allocated count
 *           decreases, availableSlots increases).
 *   TEST 6: natural Officer ID sorting (OFF1 < OFF2 < OFF3 < OFF10 < OFF20).
 *   TEST 7: repeated automatic allocation runs create no duplicates and never
 *           exceed booth capacity.
 *
 * Run: npm run capacity-test   (inside backend/)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');
const allocationService = require('../services/allocationService');
const countService = require('../services/countService');
const { compareOfficerIds, sortByOfficerId } = require('../utils/naturalSort');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/polling_system';
const TAG = `CAPT${Date.now().toString(36).toUpperCase()}`; // unique per run
const MANDAL = `Capacity Test Mandal ${TAG}`;

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS  ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`  FAIL  ${name}\n        ${error.message}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createOfficer(code) {
  return Officer.create({
    officerId: `${code}-${TAG}`,
    officerName: `Test Officer ${code}`,
    designation: 'Assistant Engineer',
    mobileNumber: '9000000001',
    locality: `OfficerVillage ${TAG}`,
    ward: '9',
    mandal: MANDAL,
    district: 'Kurnool',
    pinCode: '518442',
    isActive: true,
  });
}

async function createBooth(code, requiredOfficers) {
  return Booth.create({
    boothId: `PB${code}-${TAG}`,
    boothNumber: code,
    boothName: `Test Booth ${code}`,
    buildingName: 'Community Hall',
    locality: `BoothVillage ${TAG}`,
    ward: '10',
    mandal: MANDAL,
    district: 'Kurnool',
    pinCode: '518442',
    requiredOfficers,
    isActive: true,
  });
}

async function activeCount(boothId) {
  return Allocation.countDocuments({ booth: boothId, status: 'ALLOCATED' });
}

async function officerAllocationCount(officerId) {
  return Allocation.countDocuments({ officer: officerId, status: 'ALLOCATED' });
}

async function cleanup() {
  await Allocation.deleteMany({ mandal: MANDAL });
  await Officer.deleteMany({ mandal: MANDAL });
  await Booth.deleteMany({ mandal: MANDAL });
}

(async () => {
  console.log('Booth capacity + natural sort tests');
  console.log(`(tag ${TAG}, mandal "${MANDAL}")`);
  console.log('-----------------------------------');

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

  // ---- TEST 6 (pure function, runs first because everything else needs DB) --
  await test('TEST 6: natural Officer ID sort (OFF1, OFF10, OFF2, OFF20, OFF3)', () => {
    const input = ['OFF10', 'OFF1', 'OFF20', 'OFF2', 'OFF3'];
    const sorted = [...input].sort(compareOfficerIds);
    assert(
      JSON.stringify(sorted) === JSON.stringify(['OFF1', 'OFF2', 'OFF3', 'OFF10', 'OFF20']),
      `unexpected order: ${sorted.join(', ')}`
    );
    const docs = input.map((id) => ({ officerId: `${id}-${TAG}` }));
    const sortedDocs = sortByOfficerId(docs);
    assert(sortedDocs[0].officerId.startsWith('OFF1-'), 'OFF1 must come first');
    assert(sortedDocs[sortedDocs.length - 1].officerId.startsWith('OFF20-'), 'OFF20 must come last');
  });

  // ---- TEST 1 ---------------------------------------------------------------
  const boothA = await createBooth('101', 3);
  const officersA = [];
  for (const code of ['OFF1', 'OFF2', 'OFF3', 'OFF4', 'OFF5']) {
    officersA.push(await createOfficer(code));
  }

  await test('TEST 1: automatic allocation fills booth A to exactly 3/3', async () => {
    await allocationService.runAllocation();
    const count = await activeCount(boothA._id);
    assert(count === 3, `expected 3 allocated officers, got ${count}`);
    const fresh = await Booth.findById(boothA._id).lean();
    assert(fresh.allocatedOfficerCount === 3, `stored count should be 3, got ${fresh.allocatedOfficerCount}`);
    assert(fresh.availableSlots === 0, `availableSlots should be 0, got ${fresh.availableSlots}`);
  });

  await test('TEST 1b: 4th (manual) allocation into booth A FAILS', async () => {
    let message = null;
    try {
      await allocationService.manualAllocate(officersA[3].officerId, boothA.boothId);
    } catch (error) {
      message = error.message;
    }
    assert(message, 'expected the 4th allocation to be rejected');
    assert(
      /full|required officer capacity/i.test(message),
      `unexpected error message: ${message}`
    );
    const count = await activeCount(boothA._id);
    assert(count === 3, `allocation must stay at 3, got ${count}`);
  });

  // ---- TEST 2 ---------------------------------------------------------------
  const boothB = await createBooth('102', 5);
  const boothC = await createBooth('103', 2);
  for (let i = 6; i <= 13; i += 1) {
    await createOfficer(`OFF${i}`);
  }

  await test('TEST 2: capacities A=3, B=5, C=2 are never exceeded (13 officers > 10 slots)', async () => {
    await allocationService.runAllocation();
    const countA = await activeCount(boothA._id);
    const countB = await activeCount(boothB._id);
    const countC = await activeCount(boothC._id);
    assert(countA === 3, `booth A must hold exactly 3, got ${countA}`);
    assert(countB === 5, `booth B must hold exactly 5, got ${countB}`);
    assert(countC === 2, `booth C must hold exactly 2, got ${countC}`);
    const totalTagAllocations = await Allocation.countDocuments({
      mandal: MANDAL,
      status: 'ALLOCATED',
    });
    assert(totalTagAllocations === 10, `expected 10 total allocations, got ${totalTagAllocations}`);
  });

  // ---- TEST 3 ---------------------------------------------------------------
  await test('TEST 3: manual allocation into a full booth is rejected with a clear message', async () => {
    const spare = await Officer.findOne({ mandal: MANDAL, officerId: `OFF13-${TAG}` });
    let message = null;
    try {
      await allocationService.manualAllocate(spare.officerId, boothA.boothId);
    } catch (error) {
      message = error.message;
    }
    assert(message, 'expected rejection');
    assert(/already full/i.test(message), `message must say the booth is full: ${message}`);
  });

    // ---- TEST 4 ---------------------------------------------------------------
  const boothD = await createBooth('104', 2);
  let reallocationTarget = null;
  await test('TEST 4: reallocation into a full booth is rejected, old allocation unchanged', async () => {
    const spare = await Officer.findOne({ mandal: MANDAL, officerId: `OFF13-${TAG}` });
    if (!spare) {
      const all = await Officer.find({ mandal: MANDAL }).select('officerId isActive').lean();
      throw new Error(
        `spare OFF13 missing; mandal="${MANDAL}"; officers found: ` +
          all.map((o) => `${o.officerId}(${o.isActive})`).join(', ')
      );
    }
    let manual;
    try {
      manual = await allocationService.manualAllocate(spare._id, boothD.boothId);
    } catch (error) {
      throw new Error(`manualAllocate failed: ${error.message}`);
    }
    reallocationTarget = manual && manual.allocation;
    assert(reallocationTarget, 'manualAllocate must return the allocation');

    const before = await activeCount(boothA._id);
    let message = null;
    try {
      await allocationService.reallocateOfficer(reallocationTarget._id, boothA._id);
    } catch (error) {
      message = error.message;
    }
    assert(message, 'expected reallocation into a full booth to fail');
    assert(/full|required officer capacity/i.test(message), `unexpected message: ${message}`);

    const after = await Allocation.findById(reallocationTarget._id).lean();
    assert(after.status === 'ALLOCATED', 'old allocation must remain ALLOCATED');
    assert(String(after.booth) === String(boothD._id), 'old allocation must still point at booth D');
    assert((await activeCount(boothA._id)) === before, 'booth A count must be unchanged');
  });

  // ---- TEST 5 ---------------------------------------------------------------
  await test('TEST 5: cancelling an allocation frees the booth slot', async () => {
    const beforeBooth = await Booth.findById(boothD._id).lean();
    const beforeCount = await activeCount(boothD._id);
    const result = await allocationService.cancelAllocation(reallocationTarget._id);
    const afterBooth = await Booth.findById(boothD._id).lean();
    const afterCount = await activeCount(boothD._id);
    assert(
      afterCount === beforeCount - 1,
      `allocated count must decrease by 1 (${beforeCount} -> ${afterCount})`
    );
    assert(
      afterBooth.availableSlots === beforeBooth.availableSlots + 1,
      `availableSlots must increase by 1 (${beforeBooth.availableSlots} -> ${afterBooth.availableSlots})`
    );
    assert(result.allocation.status === 'CANCELLED', 'allocation status must be CANCELLED');
  });

  // ---- TEST 7 ---------------------------------------------------------------
  await test('TEST 7: repeated automatic runs create no duplicates and no over-capacity', async () => {
    await allocationService.runAllocation();
    await allocationService.runAllocation();

    const booths = [boothA, boothB, boothC, boothD];
    for (const booth of booths) {
      const count = await activeCount(booth._id);
      assert(
        count <= booth.requiredOfficers,
        `booth ${booth.boothNumber} exceeded capacity: ${count}/${booth.requiredOfficers}`
      );
      const stored = await Booth.findById(booth._id).lean();
      assert(
        stored.allocatedOfficerCount === count,
        `stored counter mismatch for booth ${booth.boothNumber}: ${stored.allocatedOfficerCount} != ${count}`
      );
      assert(stored.availableSlots >= 0, 'availableSlots must never be negative');
    }
    const tagOfficers = await Officer.find({ mandal: MANDAL }).select('_id').lean();
    for (const officer of tagOfficers) {
      const n = await officerAllocationCount(officer._id);
      assert(n <= 1, `officer has ${n} active allocations (duplicate allocation!)`);
    }
    const overAllocated = await countService.findOverAllocatedBooths();
    const mine = overAllocated.filter(
      (b) =>
        String(b._id) === String(boothA._id) ||
        String(b._id) === String(boothB._id) ||
        String(b._id) === String(boothC._id) ||
        String(b._id) === String(boothD._id)
    );
    assert(mine.length === 0, 'capacity report must not flag the test booths');
  });

  console.log('');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  await cleanup();
  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
  console.log('All booth capacity tests passed.');
})().catch(async (error) => {
  console.error('FATAL', error);
  try {
    await cleanup();
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
