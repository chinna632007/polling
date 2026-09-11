/**
 * smsService.js
 * ==============
 * Reusable SMS service with a provider-abstraction layer so the actual SMS
 * gateway can be swapped without touching any other code.
 *
 *  - SMS_PROVIDER=mock  -> MockSmsProvider (default; simulates delivery)
 *  - SMS_PROVIDER=http  -> HttpSmsProvider (posts to SMS_PROVIDER_API_URL,
 *                           compatible with MSG91 / TextLocal / Twilio adapters)
 *
 * Credentials are ALWAYS read from environment variables - never hardcoded.
 * Every attempt is persisted in MongoDB with a status from:
 *   PENDING | SENT | FAILED
 *
 * Requirement H: no real SMS is ever claimed unless a provider is configured.
 * The default `mock` provider simulates delivery locally so the student
 * project has a full PENDING -> SENT lifecycle without any credentials; a
 * real gateway can be wired later by setting
 *   SMS_PROVIDER=http
 *   SMS_PROVIDER_API_URL=...
 */

const crypto = require('crypto');
const Notification = require('../models/Notification');

const STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
};

const DEFAULT_PROVIDER_ID = 'mock';

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

class SmsProvider {
  /** @returns {Promise<{ messageId: string, delivered: boolean }>} */
  async send(phone, message) {
    throw new Error('send() must be implemented by the concrete provider');
  }
}

/**
 * Mock provider - used during development/demo. Simulates delivery locally
 * (no external gateway, no real SMS claimed): the persisted Notification
 * record moves PENDING -> SENT so the full lifecycle can be observed.
 */
class MockSmsProvider extends SmsProvider {
  constructor() {
    super();
    this.name = 'mock';
  }

  async send(phone, message) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      messageId: `MOCK-${crypto.randomBytes(6).toString('hex')}`,
      delivered: true,
    };
  }
}

/**
 * HTTP provider adapter. Sends a generic JSON payload so any gateway that
 * accepts a POST can be wired up by mapping fields at the gateway side:
 *   { to, message, senderId, apiKey }
 * Configure via .env: SMS_PROVIDER_API_URL, SMS_API_KEY, SMS_SENDER_ID.
 */
class HttpSmsProvider extends SmsProvider {
  constructor() {
    super();
    this.name = 'http';
    this.apiUrl = process.env.SMS_PROVIDER_API_URL;
    this.apiKey = process.env.SMS_API_KEY;
    this.senderId = process.env.SMS_SENDER_ID;
    this.extraHeaders = this._parseExtraHeaders(process.env.SMS_EXTRA_HEADERS);
  }

  _parseExtraHeaders(raw) {
    const result = {};
    if (!raw) return result;
    try {
      Object.assign(result, JSON.parse(raw));
    } catch {
      // ignore malformed headers; provider may not need them
    }
    return result;
  }

  async send(phone, message) {
    if (!this.apiUrl) {
      throw new Error('SMS_PROVIDER_API_URL is not configured in .env');
    }
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        to: phone,
        message,
        senderId: this.senderId,
        apiKey: this.apiKey,
      }),
    });
    if (!response.ok) {
      throw new Error(`SMS gateway returned HTTP ${response.status}`);
    }
    const data = await response.json().catch(() => ({}));
    return {
      messageId:
        data.messageId || data.id || data.requestId || `HTTP-${Date.now()}`,
      delivered: data.delivered === undefined ? false : Boolean(data.delivered),
    };
  }
}

/** Factory: instantiate the provider selected by the SMS_PROVIDER env var. */
function createProvider(providerName) {
  const name = (providerName || process.env.SMS_PROVIDER || DEFAULT_PROVIDER_ID).toLowerCase();
  if (name === 'http') return new HttpSmsProvider();
  return new MockSmsProvider();
}
// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

/**
 * Builds the polling-duty SMS body. Mirrors the exact wording required by
 * the specification:
 *   Dear {Name}, You have been allocated for Polling Duty.
 *   Booth Number / Booth Name / Booth Address / Mandal ...
 */
function buildAllocationMessage(officer, booth) {
  const addressLine = require('./addressMatchingService').boothAddressLine(booth);
  return [
    `Dear ${officer.officerName},`,
    '',
    'You have been allocated for Polling Duty.',
    '',
    `Booth Number: ${booth.boothNumber}`,
    `Booth Name: ${booth.boothName}`,
    `Booth Address: ${addressLine}`,
    `Mandal: ${booth.mandal}`,
    '',
    'Please report according to official instructions.',
    'Thank you.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sending + persistence
// ---------------------------------------------------------------------------

/**
 * Sends a notification message to an officer and persists every state change
 * in MongoDB with status PENDING / SENT / FAILED (requirement H).
 *
 * A real SMS provider can be plugged in later via SMS_PROVIDER=http +
 * SMS_PROVIDER_API_URL / SMS_PROVIDER_API_KEY / SMS_SENDER_ID in .env.
 * Unless those credentials are configured, the message is only stored as a
 * mock-local notification — never claimed as a real SMS delivery.
 */
async function sendSms({ officer, allocation = null, message, providerName }) {
  const provider = createProvider(providerName);

  const notification = await Notification.create({
    officer: officer._id,
    allocation: allocation ? allocation._id : undefined,
    mobileNumber: officer.mobileNumber,
    message,
    status: STATUS.PENDING,
    provider: provider.name,
  });

  try {
    const result = await provider.send(officer.mobileNumber, message);

    notification.status = result.delivered ? STATUS.SENT : STATUS.PENDING;
    notification.providerMessageId = result.messageId;
    notification.sentAt = new Date();
    await notification.save();

    // A PENDING message from the mock provider is marked SENT shortly
    // afterwards to fully emulate the real lifecycle.
    if (!result.delivered && provider.name === 'mock') {
      setTimeout(async () => {
        try {
          await Notification.updateOne(
            { _id: notification._id, status: STATUS.PENDING },
            { $set: { status: STATUS.SENT } }
          );
        } catch {
          // best-effort background update
        }
      }, 2500);
    }

    return notification;
  } catch (error) {
    notification.status = STATUS.FAILED;
    notification.error = error.message;
    await notification.save();
    return notification;
  }
}

module.exports = {
  STATUS,
  SmsProvider,
  MockSmsProvider,
  HttpSmsProvider,
  createProvider,
  buildAllocationMessage,
  sendSms,
};