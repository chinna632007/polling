const XLSX = require('xlsx');
const excelService = require('../services/excelService');
const UploadBatch = require('../models/UploadBatch');
const Officer = require('../models/Officer');
const Booth = require('../models/Booth');
const Allocation = require('../models/Allocation');
const Notification = require('../models/Notification');

const MAX_PREVIEW_ROWS = 50;

/** Reads the uploaded excel buffer into an array of row objects. */
function readExcelRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excel file has no sheets');
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/**
 * Creates an UploadBatch record so the admin can see every uploaded file
 * in the history list and later delete the whole batch (and its data).
 */
async function recordBatch({ file, kind, saveResult, admin }) {
  try {
    await UploadBatch.create({
      fileName: file?.originalname || `import-${kind}.xlsx`,
      kind,
      inserted: saveResult.inserted || 0,
      skipped: saveResult.skipped || 0,
      recordRefs: (saveResult.saved || []).map((r) =>
        kind === 'officers' ? r.officerId : r.boothId
      ),
      recordIds: (saveResult.saved || []).map((r) => r._id),
      uploadedBy: admin?._id || null,
      uploadedByUsername: admin?.username || '',
    });
  } catch (error) {
    // Recording the batch is best-effort - never fail an import over it.
    console.warn('[upload] Could not record upload batch:', error.message);
  }
}

/**
 * POST /api/upload/officers
 * Body: multipart file field "file"
 * Query: mode=preview (validate only) | mode=commit (validate + save)
 * Returns the validated entity list for preview and import counts.
 */
async function uploadOfficers(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No Excel file uploaded' });
    }
    const mode = req.query.mode || 'commit';
    const rows = readExcelRows(req.file.buffer);
    const validation = excelService.validateAndParseOfficers(rows);

    if (validation.missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${validation.missingColumns.join(', ')}`,
        missingColumns: validation.missingColumns,
      });
    }
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `${validation.errors.length} row error(s) found`,
        errors: validation.errors.slice(0, 50),
      });
    }

    if (mode === 'preview') {
      return res.json({
        success: true,
        mode: 'preview',
        preview: validation.mapped.slice(0, MAX_PREVIEW_ROWS),
        totalRows: validation.mapped.length,
        message: 'Validation successful - review the preview before importing',
      });
    }

    const saveResult = await excelService.saveOfficersFromRows(validation.mapped);
    await recordBatch({ file: req.file, kind: 'officers', saveResult, admin: req.admin });
    return res.status(201).json({
      success: true,
      mode: 'commit',
      message: `Imported ${saveResult.inserted} officers, skipped ${saveResult.skipped} duplicates`,
      preview: validation.mapped.slice(0, MAX_PREVIEW_ROWS),
      totalRows: validation.mapped.length,
      inserted: saveResult.inserted,
      skipped: saveResult.skipped,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/upload/booths - same preview/commit contract as officers.
 */
async function uploadBooths(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No Excel file uploaded' });
    }
    const mode = req.query.mode || 'commit';
    const rows = readExcelRows(req.file.buffer);
    const validation = excelService.validateAndParseBooths(rows);

    if (validation.missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${validation.missingColumns.join(', ')}`,
        missingColumns: validation.missingColumns,
      });
    }
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `${validation.errors.length} row error(s) found`,
        errors: validation.errors.slice(0, 50),
      });
    }

    if (mode === 'preview') {
      return res.json({
        success: true,
        mode: 'preview',
        preview: validation.mapped.slice(0, MAX_PREVIEW_ROWS),
        totalRows: validation.mapped.length,
        message: 'Validation successful - review the preview before importing',
      });
    }

    const saveResult = await excelService.saveBoothsFromRows(validation.mapped);
    await recordBatch({ file: req.file, kind: 'booths', saveResult, admin: req.admin });
    return res.status(201).json({
      success: true,
      mode: 'commit',
      message: `Imported ${saveResult.inserted} booths, skipped ${saveResult.skipped} duplicates`,
      preview: validation.mapped.slice(0, MAX_PREVIEW_ROWS),
      totalRows: validation.mapped.length,
      inserted: saveResult.inserted,
      skipped: saveResult.skipped,
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/upload/templates/:kind - downloads an .xlsx sample template. */
function downloadTemplate(req, res) {
  const kind = req.params.kind === 'booths' ? 'booths' : 'officers';
  const buffer = excelService.buildTemplate(kind);
  const filename = kind === 'officers' ? 'officers-template.xlsx' : 'booths-template.xlsx';
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  return res.send(buffer);
}

/** GET /api/upload/history - lists every committed Excel upload (newest first). */
async function getUploadHistory(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const batches = await UploadBatch.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({
      success: true,
      data: batches.map((b) => ({
        id: b._id,
        fileName: b.fileName,
        kind: b.kind,
        inserted: b.inserted,
        skipped: b.skipped,
        recordRefs: b.recordRefs,
        recordCount: (b.recordIds || []).length,
        uploadedByUsername: b.uploadedByUsername || '',
        uploadedAt: b.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/upload/:id
 * Deletes an uploaded file record AND completely removes its imported data
 * from MongoDB: the officers/booths, their allocations and related SMS
 * notifications are all cascaded away. Booth allocation counters on booths
 * that survive (officer batch deleted) are corrected so no stale numbers
 * remain.
 */
async function deleteUploadBatch(req, res, next) {
  try {
    const batch = await UploadBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Uploaded file record not found' });
    }

    const recordIds = (batch.recordIds || []).filter(Boolean);
    const recordIdStrings = recordIds.map((id) => String(id));
    const removed = { officers: 0, booths: 0, allocations: 0, notifications: 0 };

    if (recordIds.length > 0) {
      if (batch.kind === 'officers') {
        // 1. Allocations for these officers.
        const allocs = await Allocation.find({ officer: { $in: recordIds } }).lean();
        if (allocs.length > 0) {
          const delA = await Allocation.deleteMany({ officer: { $in: recordIds } });
          removed.allocations = delA.deletedCount || 0;

          // 2. Fix counters on booths that are NOT part of this batch.
          const boothCounts = {};
          for (const a of allocs) {
            const boothId = a.booth ? String(a.booth) : '';
            if (boothId && !recordIdStrings.includes(boothId)) {
              boothCounts[boothId] = (boothCounts[boothId] || 0) + 1;
            }
          }
          for (const [boothId, count] of Object.entries(boothCounts)) {
            await Booth.updateOne(
              { _id: boothId },
              { $inc: { allocatedOfficerCount: -count } }
            );
          }
        }

        // 3. Notifications + the officers themselves.
        const delN = await Notification.deleteMany({ officer: { $in: recordIds } });
        removed.notifications = delN.deletedCount || 0;
        const delO = await Officer.deleteMany({ _id: { $in: recordIds } });
        removed.officers = delO.deletedCount || 0;
      } else {
        // Booth batch: drop allocations pointing at these booths, then the booths.
        const delA = await Allocation.deleteMany({ booth: { $in: recordIds } });
        removed.allocations = delA.deletedCount || 0;
        const delB = await Booth.deleteMany({ _id: { $in: recordIds } });
        removed.booths = delB.deletedCount || 0;
      }
    }

    await UploadBatch.findByIdAndDelete(batch._id);

    return res.json({
      success: true,
      message:
        `Deleted uploaded file '${batch.fileName}' - removed ` +
        `${removed.officers} officer(s), ${removed.booths} booth(s), ` +
        `${removed.allocations} allocation(s), ${removed.notifications} notification(s)`,
      removed,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadOfficers,
  uploadBooths,
  downloadTemplate,
  getUploadHistory,
  deleteUploadBatch,
};