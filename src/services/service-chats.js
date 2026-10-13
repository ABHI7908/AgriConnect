'use strict';

const db = require('../db');

const WELCOME_MESSAGE =
  'Welcome to AgriConnect chat. Discuss availability, dates, pricing, location, and the work details here.';

async function ensureServiceChat({ farmerId, ownerId, kind, listingId }) {
  const column = kind === 'tool' ? 'tool_id' : 'labour_id';
  const inserted = await db.prepare(
    `INSERT INTO service_chats (farmer_id, owner_id, ${column})
     VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING id`
  ).get(farmerId, ownerId, listingId);
  if (inserted) {
    await db.prepare(
      `INSERT INTO service_chat_messages (chat_id, sender_id, body, is_system)
       VALUES (?, NULL, ?, 1)`
    ).run(inserted.id, WELCOME_MESSAGE);
    return { id: inserted.id, created: true };
  }

  const existing = await db.prepare(
    `SELECT id FROM service_chats WHERE farmer_id = ? AND ${column} = ?`
  ).get(farmerId, listingId);
  if (!existing) throw new Error('Service conversation could not be created or retrieved');
  return { id: existing.id, created: false };
}

module.exports = { ensureServiceChat, WELCOME_MESSAGE };
