/**
 * excelService.js
 * ================
 * All Excel responsibilities live here:
 *   1. Validate required columns + row data.
 *   2. Read Excel rows and map them to the MongoDB schemas.
 *   3. Preview imported data.
 *   4. Save officers / booths into MongoDB (duplicate-ID safe).
 *   5. Generate & download sample templates and allocation reports.
 */

const XLSX = require('xlsx');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Notification = require('../models/Notification');

// ---------------------------------------------------------------------------
// Column definitions (must match the specification exactly)
// ---------------------------------------------------------------------------

const OFFICER_COLUMNS = [
  'Officer ID',
  'Officer Name',
  'Designation',
  'Mobile Number',
  'Email',
  'House Number',
  'Street',
  'Village/Locality',
  'Ward',
  'Mandal',
  'District',
  'PIN Code',
];

const BOOTH_COLUMNS = [
  'Booth ID',
  'Booth Number',
  'Booth Name',
  'Building Name',
  'Street',
  'Village/Locality',
  'Ward',
  'Mandal',
  'District',
  'PIN Code',
  'Required Officers',
];

// Excel header  ->  DB field
const OFFICER_MAP = {
  'Officer ID': 'officerId',
  'Officer Name': 'officerName',
  Designation: 'designation',
  'Mobile Number': 'mobileNumber',
  Email: 'email',
  'House Number': 'houseNumber',
  Street: 'street',
  'Village/Locality': 'locality',
  Ward: 'ward',
  Mandal: 'mandal',
  District: 'district',
  'PIN Code': 'pinCode',
};

const BOOTH_MAP = {
  'Booth ID': 'boothId',
  'Booth Number': 'boothNumber',
  'Booth Name': 'boothName',
  'Building Name': 'buildingName',
  Street: 'street',
  'Village/Locality': 'locality',
  Ward: 'ward',
  Mandal: 'mandal',
  District: 'district',
  'PIN Code': 'pinCode',
  'Required Officers': 'requiredOfficers',
};

const REQUIRED_OFFICER_COLUMNS = [
  'Officer ID',
  'Officer Name',
  'Designation',
  'Mobile Number',
  'Village/Locality',
  'Mandal',
];

const REQUIRED_BOOTH_COLUMNS = [
  'Booth ID',
  'Booth Number',
  'Booth Name',
  'Village/Locality',
  'Mandal',
];

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function asString(value) {
  if (isMissing(value)) return '';
  return String(value).trim();
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tolerant header key: lowercase with every non-alphanumeric character
 * removed, so 'Village/Locality', 'Village / Locality', 'village locality'
 * and 'Village_Locality' are all treated as the same required column.
 */
function canonicalHeader(header) {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Maps the raw row (keyed by Excel headers) to the DB field shape. */
function mapRow(row, mapping) {
  const result = {};
  const keys = Object.keys(row);
  const canonicalKeys = keys.map((key) => canonicalHeader(key));
  Object.keys(mapping).forEach((header) => {
    const wanted = canonicalHeader(header);
    const index = canonicalKeys.indexOf(wanted);
    result[mapping[header]] = index !== -1 ? row[keys[index]] : undefined;
  });
  return result;
}
// ---------------------------------------------------------------------------
// Validation + parsing
// ---------------------------------------------------------------------------

/**
 * Validates an array of raw Excel rows for the OFFICER sheet.
 * Returns { valid, missingColumns, errors, preview }.
 */
function validateAndParseOfficers(rows) {
  const errors = [];
  const seenIds = new Set();
  const mapped = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, missingColumns: [], errors: ['Excel file contains no data rows'], mapped: [] };
  }

  const headers = Object.keys(rows[0]).map(canonicalHeader);
  const missingColumns = REQUIRED_OFFICER_COLUMNS.filter(
    (col) => !headers.includes(canonicalHeader(col))
  );

  rows.forEach((rawRow, index) => {
    const row = mapRow(rawRow, OFFICER_MAP);
    // Ignore fully empty rows (stray blank rows are common in Excel files).
    if (Object.values(row).every((value) => isMissing(value))) return;
    const lineNo = index + 2; // 1-based + header row

    if (isMissing(row.officerId)) errors.push(`Row ${lineNo}: Officer ID is required`);
    else if (seenIds.has(row.officerId.trim().toUpperCase())) {
      errors.push(`Row ${lineNo}: Duplicate Officer ID '${row.officerId}' inside the file`);
    } else {
      seenIds.add(row.officerId.trim().toUpperCase());
    }

    if (isMissing(row.officerName)) errors.push(`Row ${lineNo}: Officer Name is required`);
    if (isMissing(row.designation)) errors.push(`Row ${lineNo}: Designation is required`);
    if (isMissing(row.mobileNumber)) {
      errors.push(`Row ${lineNo}: Mobile Number is required`);
    } else if (!/^[0-9+\-\s]{10,15}$/.test(String(row.mobileNumber))) {
      errors.push(`Row ${lineNo}: Mobile Number '${row.mobileNumber}' is invalid`);
    }
    if (!isMissing(row.pinCode) && !/^\d{6}$/.test(String(row.pinCode))) {
      errors.push(`Row ${lineNo}: PIN Code must be a 6-digit number`);
    }
    if (isMissing(row.locality)) errors.push(`Row ${lineNo}: Village/Locality is required`);
    if (isMissing(row.mandal)) errors.push(`Row ${lineNo}: Mandal is required`);

    mapped.push({
      ...row,
      officerId: asString(row.officerId),
      officerName: asString(row.officerName),
      designation: asString(row.designation),
      mobileNumber: asString(row.mobileNumber),
      email: asString(row.email),
      houseNumber: asString(row.houseNumber),
      street: asString(row.street),
      locality: asString(row.locality),
      ward: asString(row.ward),
      mandal: asString(row.mandal),
      district: asString(row.district),
      pinCode: asString(row.pinCode),
    });
  });

  return {
    valid: errors.length === 0,
    missingColumns,
    errors,
    mapped,
    preview: mapped.slice(0, 50),
  };
}

/**
 * Validates an array of raw Excel rows for the BOOTH sheet.
 */
function validateAndParseBooths(rows) {
  const errors = [];
  const seenIds = new Set();
  const mapped = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, missingColumns: [], errors: ['Excel file contains no data rows'], mapped: [] };
  }

  const headers = Object.keys(rows[0]).map(canonicalHeader);
  const missingColumns = REQUIRED_BOOTH_COLUMNS.filter(
    (col) => !headers.includes(canonicalHeader(col))
  );

  rows.forEach((rawRow, index) => {
    const row = mapRow(rawRow, BOOTH_MAP);
    // Ignore fully empty rows (stray blank rows are common in Excel files).
    if (Object.values(row).every((value) => isMissing(value))) return;
    const lineNo = index + 2;

    if (isMissing(row.boothId)) errors.push(`Row ${lineNo}: Booth ID is required`);
    else if (seenIds.has(row.boothId.trim().toUpperCase())) {
      errors.push(`Row ${lineNo}: Duplicate Booth ID '${row.boothId}' inside the file`);
    } else {
      seenIds.add(row.boothId.trim().toUpperCase());
    }

    if (isMissing(row.boothNumber)) errors.push(`Row ${lineNo}: Booth Number is required`);
    if (isMissing(row.boothName)) errors.push(`Row ${lineNo}: Booth Name is required`);
    if (isMissing(row.locality)) errors.push(`Row ${lineNo}: Village/Locality is required`);
    if (isMissing(row.mandal)) errors.push(`Row ${lineNo}: Mandal is required`);
    if (!isMissing(row.pinCode) && !/^\d{6}$/.test(String(row.pinCode))) {
      errors.push(`Row ${lineNo}: PIN Code must be a 6-digit number`);
    }
    if (isMissing(row.requiredOfficers)) {
      errors.push(`Row ${lineNo}: Required Officers is required`);
    } else {
      const parsed = Number(row.requiredOfficers);
      if (Number.isNaN(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        errors.push(`Row ${lineNo}: Required Officers must be a non-negative integer`);
      }
    }

    mapped.push({
      ...row,
      boothId: asString(row.boothId),
      boothNumber: asString(row.boothNumber),
      boothName: asString(row.boothName),
      buildingName: asString(row.buildingName),
      street: asString(row.street),
      locality: asString(row.locality),
      ward: asString(row.ward),
      mandal: asString(row.mandal),
      district: asString(row.district),
      pinCode: asString(row.pinCode),
      requiredOfficers: Number(row.requiredOfficers),
    });
  });

  return {
    valid: errors.length === 0,
    missingColumns,
    errors,
    mapped,
    preview: mapped.slice(0, 50),
  };
}
// ---------------------------------------------------------------------------
// Persisting validated data
// ---------------------------------------------------------------------------

/**
 * Saves validated officer rows. Duplicate Officer IDs are skipped and
 * counted so a re-upload of the same file never creates duplicates.
 */
async function saveOfficersFromRows(mappedRows) {
  let inserted = 0;
  let skipped = 0;
  const saved = [];

  for (const row of mappedRows) {
    const exists = await Officer.findOne({
      officerId: row.officerId.toUpperCase(),
    }).lean();
    if (exists) {
      skipped += 1;
      continue;
    }
    const officer = await Officer.create(row);
    saved.push(officer);
    inserted += 1;
  }
  return { inserted, skipped, count: saved.length, saved };
}

/** Saves validated booth rows; duplicate Booth IDs are skipped. */
async function saveBoothsFromRows(mappedRows) {
  let inserted = 0;
  let skipped = 0;
  const saved = [];

  for (const row of mappedRows) {
    const exists = await Booth.findOne({ boothId: row.boothId.toUpperCase() }).lean();
    if (exists) {
      skipped += 1;
      continue;
    }
    const booth = await Booth.create(row);
    saved.push(booth);
    inserted += 1;
  }
  return { inserted, skipped, count: saved.length, saved };
}

// ---------------------------------------------------------------------------
// XLSX buffer helpers
// ---------------------------------------------------------------------------

/** Converts an array of JSON objects into an XLSX file buffer. */
function toXlsxBuffer(rows, sheetName = 'Sheet1') {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No data' }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/** Builds a template workbook with realistic sample rows for officers or booths. */
function buildTemplate(kind) {
  const sampleRows =
    kind === 'officers'
      ? [
          {
            'Officer ID': 'OFF001',
            'Officer Name': 'Rama Rao',
            Designation: 'Assistant Engineer',
            'Mobile Number': '9876543210',
            Email: 'rama.rao@example.gov.in',
            'House Number': '12-3/4',
            Street: 'Main Road',
            'Village/Locality': 'Kothapeta',
            Ward: '5',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518442',
          },
          {
            'Officer ID': 'OFF002',
            'Officer Name': 'Sita Devi',
            Designation: 'School Teacher',
            'Mobile Number': '9876500011',
            Email: 'sita.devi@example.gov.in',
            'House Number': '4-56',
            Street: 'Church Street',
            'Village/Locality': 'Gandhinagar',
            Ward: '8',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518443',
          },
          {
            'Officer ID': 'OFF003',
            'Officer Name': 'Mohan Krishna',
            Designation: 'Revenue Inspector',
            'Mobile Number': '9701122334',
            Email: 'mohan.krishna@example.gov.in',
            'House Number': '7-89',
            Street: 'Temple Street',
            'Village/Locality': 'Rayadurgam',
            Ward: '12',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518445',
          },
        ]
      : [
          {
            'Booth ID': 'BOOTH001',
            'Booth Number': '101',
            'Booth Name': 'MPP School Main Building',
            'Building Name': 'MPP School',
            Street: 'Church Street',
            'Village/Locality': 'Gandhinagar',
            Ward: '8',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518443',
            'Required Officers': 3,
          },
          {
            'Booth ID': 'BOOTH002',
            'Booth Number': '102',
            'Booth Name': 'ZP High School Room 4',
            'Building Name': 'ZP High School',
            Street: 'Temple Street',
            'Village/Locality': 'Rayadurgam',
            Ward: '12',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518445',
            'Required Officers': 2,
          },
          {
            'Booth ID': 'BOOTH003',
            'Booth Number': '103',
            'Booth Name': 'Panchayat Office Hall',
            'Building Name': 'Gram Panchayat Office',
            Street: 'Main Road',
            'Village/Locality': 'Kothapeta',
            Ward: '5',
            Mandal: 'Pedarami Reddy Palli',
            District: 'Kurnool',
            'PIN Code': '518442',
            'Required Officers': 2,
          },
        ];

  return toXlsxBuffer(sampleRows, kind === 'officers' ? 'Officers' : 'Booths');
}
// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Officer List (all officers) -> XLSX buffer */
/** Officer master list -> XLSX buffer (filter = role-scoped query). */
async function officerReport(filter = {}) {
  const officers = await Officer.find(filter).sort({ officerId: 1 }).lean();
  const rows = officers.map((o) => ({
    'Officer ID': o.officerId,
    'Officer Name': o.officerName,
    Designation: o.designation,
    'Mobile Number': o.mobileNumber,
    Email: o.email,
    'House Number': o.houseNumber,
    Street: o.street,
    'Village/Locality': o.locality,
    Ward: o.ward,
    Mandal: o.mandal,
    District: o.district,
    'PIN Code': o.pinCode,
  }));
  return toXlsxBuffer(rows, 'Officers');
}

/** Booth List -> XLSX buffer (filter = role-scoped query). */
async function boothReport(filter = {}) {
  const booths = await Booth.find(filter).sort({ boothId: 1 }).lean();
  const rows = booths.map((b) => ({
    'Booth ID': b.boothId,
    'Booth Number': b.boothNumber,
    'Booth Name': b.boothName,
    'Building Name': b.buildingName,
    Street: b.street,
    'Village/Locality': b.locality,
    Ward: b.ward,
    Mandal: b.mandal,
    District: b.district,
    'PIN Code': b.pinCode,
    'Required Officers': b.requiredOfficers,
    'Allocated Officers': b.allocatedOfficerCount,
    'Vacant Slots': Math.max(0, b.requiredOfficers - b.allocatedOfficerCount),
  }));
  return toXlsxBuffer(rows, 'Booths');
}

/** Allocated Officers report -> every non-cancelled allocation with a booth. */
async function allocationReport(filter = {}) {
  const allocations = await getAllocationRowsForReport({
    status: { $ne: 'Cancelled' },
    booth: { $ne: null },
    ...filter,
  });
  const rows = allocations.map((a) => ({
    'Allocation ID': a.allocationId,
    'Officer ID': a.officer?.officerId || '',
    'Officer Name': a.officer?.officerName || '',
    Designation: a.officer?.designation || '',
    'Mobile Number': a.officer?.mobileNumber || '',
    'Officer Locality': a.officer?.locality || '',
    'Officer Ward': a.officer?.ward || '',
    'Booth Number': a.booth?.boothNumber || '',
    'Booth Name': a.booth?.boothName || '',
    'Booth Locality': a.booth?.locality || '',
    'Booth Ward': a.booth?.ward || '',
    Mandal: a.mandal || '',
    'Allocation Status': a.status,
    'Approval Status': a.adminApproved ? 'Approved' : 'Pending Approval',
    'Address Match Score': a.addressMatchScore,
    'Allocation Date': a.allocationDate ? new Date(a.allocationDate).toISOString() : '',
  }));
  return toXlsxBuffer(rows, 'Allocations');
}

/** Unallocated Officers report (filter = role-scoped query). */
async function unallocatedOfficersReport(filter = {}) {
  const records = await Allocation.find({ status: 'Unallocated', ...filter })
    .populate('officer')
    .lean();
  const rows = records.map((a) => ({
    'Allocation ID': a.allocationId,
    'Officer ID': a.officer?.officerId || '',
    'Officer Name': a.officer?.officerName || '',
    Designation: a.officer?.designation || '',
    'Mobile Number': a.officer?.mobileNumber || '',
    'Officer Locality': a.officer?.locality || '',
    'Officer Ward': a.officer?.ward || '',
    Mandal: a.officer?.mandal || '',
    District: a.officer?.district || '',
    'PIN Code': a.officer?.pinCode || '',
    Status: 'Unallocated',
    Reason: (a.rejectedReasons || []).join('; '),
  }));
  return toXlsxBuffer(rows, 'Unallocated Officers');
}

/** Notification Status report. */
async function notificationReport(filter = {}) {
  const notifications = await Notification.find(filter)
    .populate('officer')
    .sort({ createdAt: -1 })
    .lean();
  const rows = notifications.map((n) => ({
    'Officer ID': n.officer?.officerId || '',
    'Officer Name': n.officer?.officerName || '',
    'Mobile Number': n.mobileNumber,
    Status: n.status,
    Provider: n.provider,
    'Provider Message ID': n.providerMessageId || '',
    'Sent At': n.sentAt ? new Date(n.sentAt).toISOString() : '',
    Error: n.error || '',
  }));
  return toXlsxBuffer(rows, 'Notifications');
}

/**
 * Shared query helper so report controllers and the allocation service use
 * the exact same population logic.
 */
async function getAllocationRowsForReport(filter = {}) {
  const Allocation = require('../models/Allocation');
  return Allocation.find(filter)
    .populate('officer')
    .populate('booth')
    .sort({ allocationDate: -1 })
    .lean();
}

module.exports = {
  OFFICER_COLUMNS,
  BOOTH_COLUMNS,
  OFFICER_MAP,
  BOOTH_MAP,
  isMissing,
  asString,
  mapRow,
  validateAndParseOfficers,
  validateAndParseBooths,
  saveOfficersFromRows,
  saveBoothsFromRows,
  toXlsxBuffer,
  buildTemplate,
  officerReport,
  boothReport,
  allocationReport,
  unallocatedOfficersReport,
  notificationReport,
};