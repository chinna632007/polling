/**
 * e2e-test.js
 * ===========
 * End-to-end HTTP test against a running backend (MongoDB must be up).
 *  1. expects the API at http://localhost:5000
 *  2. logs in as admin
 *  3. seeds officers + booths (duplicate-safe)
 *  4. runs the allocation algorithm
 *  5. verifies the address-conflict rule (same-locality is NOT allocated)
 *  6. approves an allocation and sends an SMS (mock provider)
 *  7. checks notification + report endpoints respond
 *
 * Run: node scripts/e2e-test.js
 */

const BASE = process.env.API_BASE || 'http://localhost:5000';

let passed = 0;
let failed = 0;
let token = null;

const ADMIN = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Admin@12345',
};

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

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} ${path}: ${data.message || ''}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

/** POST that tolerates 409 so the test is repeatable against existing data. */
async function seed(method, path, body) {
  try {
    return await api(method, path, body);
  } catch (error) {
    if (error.status === 409) return null; // already exists from a previous run
    throw error;
  }
}

(async () => {
  console.log('E2E test against', BASE);
  console.log('-------------------------');

  await test('POST /api/auth/login returns a JWT', async () => {
    const res = await api('POST', '/api/auth/login', ADMIN);
    if (!res.token) throw new Error('no token in response');
    token = res.token;
  });

  await test('POST /api/auth/login rejects bad password', async () => {
    try {
      await api('POST', '/api/auth/login', { username: ADMIN.username, password: 'wrong' });
      throw new Error('should have failed');
    } catch (error) {
      if (error.status !== 401) throw new Error(`expected 401, got ${error.status}`);
    }
  });

  await test('GET /api/officers (protected) works', async () => {
    const res = await api('GET', '/api/officers?limit=5');
    if (!Array.isArray(res.data)) throw new Error('data is not an array');
  });

  // --- Seed data -------------------------------------------------------------
  await test('seed officers + booths', async () => {
    await seed('POST', '/api/officers', {
      officerId: 'OFF-E2E-A',
      officerName: 'Test Officer A',
      designation: 'Assistant Engineer',
      mobileNumber: '9000000001',
      email: 'a@test.gov.in',
      locality: 'Kothapeta',
      ward: '5',
      street: 'Main Road',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518442',
    });
    await seed('POST', '/api/officers', {
      officerId: 'OFF-E2E-B',
      officerName: 'Test Officer B',
      designation: 'Teacher',
      mobileNumber: '9000000002',
      locality: 'Gandhinagar',
      ward: '8',
      street: 'Church Street',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518443',
    });
    // Same locality as Officer A -> should always be allocated elsewhere
    await seed('POST', '/api/officers', {
      officerId: 'OFF-E2E-C',
      officerName: 'Test Officer C',
      designation: 'Clerk',
      mobileNumber: '9000000003',
      locality: 'Kothapeta',
      ward: '5',
      street: 'Main Road',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518442',
    });
  });

  await test('seed booths in the same Mandal', async () => {
    // Booth 1: Kothapeta locality (conflict with officer A & C)
    await seed('POST', '/api/booths', {
      boothId: 'BOOTH-E2E-1',
      boothNumber: '501',
      boothName: 'Kothapeta MPP School',
      buildingName: 'MPP School',
      locality: 'Kothapeta',
      ward: '5',
      street: 'Main Road',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518442',
      requiredOfficers: 2,
    });
    // Booth 2: Rayadurgam locality (safe for everyone)
    await seed('POST', '/api/booths', {
      boothId: 'BOOTH-E2E-2',
      boothNumber: '502',
      boothName: 'Rayadurgam ZP High School',
      buildingName: 'ZP High School',
      locality: 'Rayadurgam',
      ward: '12',
      street: 'Temple Street',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518445',
      requiredOfficers: 3,
    });
  });
// --- Allocation -------------------------------------------------------------
  await test('POST /api/allocation/run completes', async () => {
    const runResult = await api('POST', '/api/allocation/run');
    const d = runResult.data;
    if (!d) throw new Error('no data returned');
    console.log(
      `          (${d.allocated} allocated, ${d.unallocated} unallocated, ${d.skipped} skipped)`
    );
  });

  await test('allocations never pair same-locality officer with same-locality booth', async () => {
    const { data } = await api('GET', '/api/allocation?limit=200');
    const invalid = data.filter(
      (a) =>
        a.officer &&
        a.booth &&
        String(a.officer.locality || '').trim().toLowerCase() ===
          String(a.booth.locality || '').trim().toLowerCase() &&
        a.status !== 'Cancelled'
    );
    if (invalid.length > 0) {
      throw new Error(
        `found ${invalid.length} invalid same-locality allocation(s): ${invalid
          .map((a) => `${a.officer.officerId}->${a.booth.boothId}`)
          .join(', ')}`
      );
    }
  });

  let approvedAllocation = null;
  await test('approve an allocation + send SMS', async () => {
    const { data } = await api('GET', '/api/allocation?limit=50');
    const candidate = data.find((a) => a.status === 'Pending Approval' && a.booth);
    if (!candidate) throw new Error('no pending allocation to approve');
    const approved = await api('POST', `/api/allocation/${candidate._id}/approve`);
    if (approved.data.adminApproved !== true) throw new Error('approval not persisted');
    approvedAllocation = approved.data;

    const notif = await api('POST', `/api/notifications/send/${candidate._id}`);
    if (!notif.data || !notif.data.status) throw new Error('no notification status returned');
    console.log(
      `          notification status: ${notif.data.status} (provider ${notif.data.provider})`
    );
  });

  // A fresh spare booth guarantees reallocation always has a suitable target,
  // keeping the test deterministic even after many repeated runs.
  await test('seed a spare booth with free capacity', async () => {
    const spare = await api('POST', '/api/booths', {
      boothId: `BOOTH-E2E-SPARE-${Date.now()}`,
      boothNumber: '599',
      boothName: 'Spare Community Hall',
      buildingName: 'Community Hall',
      locality: 'Sparepuram',
      ward: '20',
      street: 'New Street',
      mandal: 'QaMandal',
      district: 'Kurnool',
      pinCode: '518449',
      requiredOfficers: 2,
    });
    if (!spare.data) throw new Error('spare booth not created');
  });

  await test('reallocate creates a new allocation and cancels the old one', async () => {
    if (!approvedAllocation) throw new Error('previous test failed');
    const res = await api(
      'POST',
      `/api/allocation/${approvedAllocation._id}/reallocate`,
      {}
    );
    if (!res.data || !res.data.newAllocation) throw new Error('no new allocation returned');
    if (res.data.cancelledAllocation.status !== 'Cancelled') {
      throw new Error('old allocation was not cancelled');
    }
  });

  await test('report endpoints respond 200 with xlsx content', async () => {
    const response = await fetch(`${BASE}/api/reports/allocation-excel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`report HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('spreadsheet')) {
      throw new Error(`unexpected content-type: ${contentType}`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1000) throw new Error('report file too small');
  });

  await test('dashboard stats endpoint works', async () => {
    const res = await api('GET', '/api/dashboard/stats');
    if (typeof res.data?.totalOfficers !== 'number') throw new Error('missing stats');
  });

  console.log('');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('E2E flow succeeded.');
})().catch((error) => {
  console.error('FATAL', error);
  process.exit(1);
});