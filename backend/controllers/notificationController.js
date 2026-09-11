const Allocation = require('../models/Allocation');
const Notification = require('../models/Notification');
const smsService = require('../services/smsService');
const { notificationScopeFilter } = require('../services/roleService');

/**
 * POST /api/notifications/send/:allocationId
 * Builds the polling-duty message for the officer and sends it via the
 * configured SMS provider. Persists every notification status change.
 */
async function sendAllocationNotification(req, res, next) {
  try {
    const allocation = await Allocation.findById(req.params.allocationId)
      .populate('officer')
      .populate('booth');

    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }
    if (!allocation.booth) {
      return res.status(400).json({
        success: false,
        message: 'This officer has no booth allocation - cannot send a notification',
      });
    }
    if (allocation.status !== 'ALLOCATED') {
      return res.status(400).json({
        success: false,
        message: 'Notification can only be sent for an ALLOCATED allocation',
      });
    }
    if (!allocation.officer) {
      return res.status(404).json({ success: false, message: 'Officer record missing' });
    }

    const message = smsService.buildAllocationMessage(allocation.officer, allocation.booth);
    const notification = await smsService.sendSms({
      officer: allocation.officer,
      allocation,
      message,
    });

    return res.status(200).json({
      success: true,
      message: `Notification queued with status '${notification.status}'`,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/notifications?status=&page=&limit=
 * A Mandal Officer only ever sees notifications belonging to officers inside
 * their assigned Mandal (enforced server-side).
 */
async function getNotifications(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // Scope notifications to the user's assigned officers (Mandal Officers).
    const notifScope = await notificationScopeFilter(req.user);
    Object.assign(filter, notifScope);

    const query = Notification.find(filter).populate('officer').sort({ createdAt: -1 });

    const [data, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { sendAllocationNotification, getNotifications };