'use strict';

const db = require('../db');
const config = require('../config');
const { sendNotificationSms } = require('./sms');
const { maskPhone } = require('../utils/phone');

async function createNotification({ recipientId, actorId, bookingId, chatId, kind, title, body }) {
  await db.prepare(
    `INSERT INTO notifications (recipient_id, actor_id, booking_id, chat_id, kind, title, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(recipientId, actorId ?? null, bookingId ?? null, chatId ?? null, kind, title, body);
}

// Throttle alert SMS per phone number so chat/booking activity cannot be used to spam a user
// or run up the SMS bill. In-app notifications are always created; only the SMS is rate-limited.
// This map is per process; use a shared store (Redis/DB) if you run several instances.
const lastAlertAt = new Map();
const MAX_TRACKED_PHONES = 50000;

function alertAllowed(phone, now = Date.now()) {
  const gap = config.ALERT_SMS_MIN_INTERVAL_SECONDS * 1000;
  if (gap <= 0) return true;
  const last = lastAlertAt.get(phone);
  if (last !== undefined && now - last < gap) return false;
  if (lastAlertAt.size >= MAX_TRACKED_PHONES) {
    for (const [key, at] of lastAlertAt) if (now - at >= gap) lastAlertAt.delete(key);
    if (lastAlertAt.size >= MAX_TRACKED_PHONES) lastAlertAt.clear();
  }
  lastAlertAt.set(phone, now);
  return true;
}

function sendAlert(phone) {
  if (!phone) return;
  if (!alertAllowed(phone)) return;
  sendNotificationSms(phone).catch((err) => {
    // In-app notifications remain available when the external SMS provider is unavailable.
    // eslint-disable-next-line no-console
    console.error(`Booking notification SMS failed for ${maskPhone(phone)}:`, err.message);
  });
}

module.exports = { createNotification, sendAlert, alertAllowed, _lastAlertAt: lastAlertAt };
