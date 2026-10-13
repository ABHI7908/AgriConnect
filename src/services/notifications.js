'use strict';

const db = require('../db');
const { sendNotificationSms } = require('./sms');
const { maskPhone } = require('../utils/phone');

async function createNotification({ recipientId, actorId, bookingId, chatId, kind, title, body }) {
  await db.prepare(
    `INSERT INTO notifications (recipient_id, actor_id, booking_id, chat_id, kind, title, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(recipientId, actorId ?? null, bookingId ?? null, chatId ?? null, kind, title, body);
}

function sendAlert(phone) {
  if (!phone) return;
  sendNotificationSms(phone).catch((err) => {
    // In-app notifications remain available when the external SMS provider is unavailable.
    // eslint-disable-next-line no-console
    console.error(`Booking notification SMS failed for ${maskPhone(phone)}:`, err.message);
  });
}

module.exports = { createNotification, sendAlert };
