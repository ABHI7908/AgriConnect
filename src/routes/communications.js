'use strict';

const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { AppError, badRequest, forbidden, notFound } = require('../utils/errors');
const { createNotification, sendAlert } = require('../services/notifications');
const { ensureServiceChat } = require('../services/service-chats');

const router = express.Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });
const listingQuery = z.object({
  kind: z.enum(['tool', 'labour']),
  listingId: z.coerce.number().int().positive(),
});
const chatStartBody = z.object({
  kind: z.enum(['tool', 'labour']),
  listingId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(2000),
  language: z.enum(['en', 'te', 'hi']).default('en'),
});
const chatMessageBody = z.object({
  body: z.string().trim().min(1).max(2000),
  language: z.enum(['en', 'te', 'hi']).default('en'),
});
const chatAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 2, fieldSize: 100 },
  fileFilter(_req, file, callback) {
    const type = file.mimetype.toLowerCase().split(';')[0];
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/3gpp'].includes(type)) {
      return callback(new AppError(400, 'Use a supported audio recording format', 'INVALID_AUDIO'));
    }
    return callback(null, true);
  },
});

function uploadVoice(req, res, next) {
  chatAudio.single('voice')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'Voice notes must be 3 MB or smaller', 'AUDIO_TOO_LARGE'));
    }
    return next(err);
  });
}

function validAudioSignature(file) {
  const { buffer } = file;
  const type = file.mimetype.toLowerCase().split(';')[0];
  if (type === 'audio/webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === 'audio/ogg') return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  if (type === 'audio/mp4' || type === 'audio/3gpp') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  if (type === 'audio/wav' || type === 'audio/x-wav') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  }
  if (type === 'audio/mpeg') {
    return buffer.length >= 3 && (buffer.toString('ascii', 0, 3) === 'ID3' ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
  }
  return false;
}
router.use(requireAuth);

async function getParticipantBooking(id, user) {
  const booking = await db.prepare(
    `SELECT b.id, b.kind, b.tool_id, b.labour_id, b.farmer_id, b.owner_id, b.item_title, b.status,
            f.phone AS farmer_phone, o.phone AS owner_phone
       FROM bookings b
       JOIN users f ON f.id = b.farmer_id
       JOIN users o ON o.id = b.owner_id
      WHERE b.id = ?`
  ).get(id);
  if (!booking) throw notFound('Booking not found');
  if (booking.farmer_id !== user.id && booking.owner_id !== user.id) throw forbidden();
  return booking;
}

async function getChatListing(kind, id) {
  const listing = kind === 'tool'
    ? await db.prepare(
      `SELECT t.id, t.owner_id, t.name AS title, t.available, t.price_per_hour, t.price_per_day,
              t.price_per_acre, u.name AS owner_name, u.business_name AS owner_business
         FROM tools t JOIN users u ON u.id = t.owner_id
        WHERE t.id = ? AND t.status = 'approved' AND u.status = 'active'`
    ).get(id)
    : await db.prepare(
      `SELECT l.id, l.provider_id AS owner_id, l.title, l.available, l.wage_per_day,
              l.team_size, u.name AS owner_name, u.business_name AS owner_business
         FROM labour_listings l JOIN users u ON u.id = l.provider_id
        WHERE l.id = ? AND l.status = 'approved' AND u.status = 'active'`
    ).get(id);
  if (!listing) throw notFound('This service is not available for chat');
  return {
    ...listing,
    kind,
    providerName: listing.owner_business || listing.owner_name || 'Provider',
    prices: kind === 'tool'
      ? {
          perHour: listing.price_per_hour,
          perDay: listing.price_per_day,
          perAcre: listing.price_per_acre,
        }
      : { perPersonPerDay: listing.wage_per_day, teamSize: listing.team_size },
  };
}

async function getServiceChat(id, user) {
  const chat = await db.prepare(
    `SELECT c.id, c.farmer_id, c.owner_id, c.tool_id, c.labour_id,
            f.phone AS farmer_phone, o.phone AS owner_phone,
            COALESCE(o.business_name, o.name) AS provider_name,
            COALESCE(t.name, l.title) AS listing_title,
            CASE WHEN c.tool_id IS NOT NULL THEN 'tool' ELSE 'labour' END AS listing_kind,
            COALESCE(c.tool_id, c.labour_id) AS listing_id,
            EXISTS (
              SELECT 1 FROM bookings b
               WHERE b.farmer_id = c.farmer_id AND b.owner_id = c.owner_id
                 AND b.status IN ('accepted','in_progress','completed')
                 AND ((c.tool_id IS NOT NULL AND b.tool_id = c.tool_id)
                   OR (c.labour_id IS NOT NULL AND b.labour_id = c.labour_id))
            ) AS call_available
       FROM service_chats c
       JOIN users f ON f.id = c.farmer_id
       JOIN users o ON o.id = c.owner_id
       LEFT JOIN tools t ON t.id = c.tool_id
       LEFT JOIN labour_listings l ON l.id = c.labour_id
      WHERE c.id = ?`
  ).get(id);
  if (!chat) throw notFound('Conversation not found');
  if (chat.farmer_id !== user.id && chat.owner_id !== user.id) throw forbidden();
  return chat;
}

router.get('/notifications', requireRole('farmer', 'owner'), async (req, res) => {
  const unread = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND read_at IS NULL'
  ).get(req.user.id);
  const items = await db.prepare(
    `SELECT n.id, n.booking_id, n.kind, n.title, n.body, n.created_at, n.read_at,
            COALESCE(n.chat_id, (
              SELECT c.id
                FROM bookings b
                JOIN service_chats c
                  ON c.farmer_id = b.farmer_id AND c.owner_id = b.owner_id
                 AND ((b.tool_id IS NOT NULL AND c.tool_id = b.tool_id)
                   OR (b.labour_id IS NOT NULL AND c.labour_id = b.labour_id))
               WHERE b.id = n.booking_id
               LIMIT 1
            )) AS chat_id,
            COALESCE(a.business_name, a.name) AS actor_name
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
      WHERE n.recipient_id = ?
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 50`
  ).all(req.user.id);
  res.json({ unreadCount: unread.count, items });
});

router.get('/chats', requireRole('farmer', 'owner'), async (req, res) => {
  const items = await db.prepare(
    `SELECT c.id,
            CASE WHEN c.tool_id IS NOT NULL THEN 'tool' ELSE 'labour' END AS kind,
            COALESCE(c.tool_id, c.labour_id) AS listing_id,
            COALESCE(t.name, l.title) AS listing_title,
            COALESCE(o.business_name, o.name, 'Provider') AS provider_name,
            COALESCE(f.name, f.phone, 'Farmer') AS farmer_name,
            (SELECT CASE WHEN m.audio_data IS NOT NULL AND m.body = '' THEN 'Voice note' ELSE m.body END
               FROM service_chat_messages m
              WHERE m.chat_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
            (SELECT m.created_at FROM service_chat_messages m
              WHERE m.chat_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM notifications n
              WHERE n.chat_id = c.id AND n.recipient_id = ? AND n.read_at IS NULL) AS unread_count
       FROM service_chats c
       JOIN users f ON f.id = c.farmer_id
       JOIN users o ON o.id = c.owner_id
       LEFT JOIN tools t ON t.id = c.tool_id
       LEFT JOIN labour_listings l ON l.id = c.labour_id
      WHERE ${req.user.role === 'farmer' ? 'c.farmer_id' : 'c.owner_id'} = ?
      ORDER BY COALESCE(
        (SELECT MAX(m.created_at) FROM service_chat_messages m WHERE m.chat_id = c.id),
        c.updated_at
      ) DESC, c.id DESC`
  ).all(req.user.id, req.user.id);
  res.json({
    items: items.map((item) => ({
      ...item,
      otherName: req.user.role === 'farmer' ? item.provider_name : item.farmer_name,
    })),
  });
});

router.get('/chats/listing', requireRole('farmer'), validate({ query: listingQuery }), async (req, res) => {
  const { kind, listingId } = req.valid.query;
  const listing = await getChatListing(kind, listingId);
  if (listing.owner_id === req.user.id) throw forbidden('You cannot message your own listing');
  res.json({
    listing: {
      id: listing.id,
      kind: listing.kind,
      title: listing.title,
      available: listing.available,
      providerName: listing.providerName,
      prices: listing.prices,
    },
  });
});

router.get(
  '/chats/booking/:id',
  requireRole('farmer', 'owner'),
  validate({ params: idParams }),
  async (req, res) => {
    const booking = await getParticipantBooking(req.valid.params.id, req.user);
    const listingId = booking.kind === 'tool' ? booking.tool_id : booking.labour_id;
    if (!listingId) throw notFound('The listing for this booking is no longer available');
    const chat = await db.transaction(async () => ensureServiceChat({
      farmerId: booking.farmer_id,
      ownerId: booking.owner_id,
      kind: booking.kind,
      listingId,
    }))();
    res.json({ id: chat.id });
  }
);

router.post('/chats', requireRole('farmer'), validate({ body: chatStartBody }), async (req, res) => {
  const { kind, listingId, body } = req.valid.body;
  const listing = await getChatListing(kind, listingId);
  if (listing.owner_id === req.user.id) throw forbidden('You cannot message your own listing');

  const created = await db.transaction(async () => {
    const chat = await ensureServiceChat({
      farmerId: req.user.id,
      ownerId: listing.owner_id,
      kind,
      listingId,
    });
    await db.prepare(
      'INSERT INTO service_chat_messages (chat_id, sender_id, body, message_language) VALUES (?, ?, ?, ?)'
    ).run(chat.id, req.user.id, body, req.valid.body.language);
    await createNotification({
      recipientId: listing.owner_id,
      actorId: req.user.id,
      chatId: chat.id,
      kind: 'service_message',
      title: 'New service enquiry',
      body: `A farmer messaged you about ${listing.title}.`,
    });
    return chat;
  })();

  const provider = await db.prepare('SELECT phone FROM users WHERE id = ?').get(listing.owner_id);
  sendAlert(provider.phone);
  res.status(201).json({ id: created.id });
});

router.get('/chats/:id/messages', requireRole('farmer', 'owner'), validate({ params: idParams }), async (req, res) => {
  const chat = await getServiceChat(req.valid.params.id, req.user);
  const messages = await db.prepare(
    `SELECT m.id, m.sender_id, m.body, m.is_system, m.message_language,
            (m.audio_data IS NOT NULL) AS has_audio, m.created_at,
            CASE WHEN m.is_system = 1 THEN 'AgriConnect' ELSE COALESCE(u.business_name, u.name, u.phone) END AS sender_name,
            CASE WHEN m.is_system = 1 THEN 'system' ELSE u.role END AS sender_role
       FROM service_chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 200`
  ).all(chat.id);
  const canCall = Boolean(chat.call_available);
  res.json({
    chat: {
      id: chat.id,
      kind: chat.listing_kind,
      listingId: chat.listing_id,
      listingTitle: chat.listing_title,
      providerName: chat.provider_name,
      callPhone: canCall ? (req.user.role === 'farmer' ? chat.owner_phone : chat.farmer_phone) : null,
    },
    items: messages.map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      senderName: message.sender_name,
      senderRole: message.sender_role,
      body: message.body,
      language: message.message_language,
      isSystem: Boolean(message.is_system),
      hasAudio: Boolean(message.has_audio),
      createdAt: message.created_at,
      isMine: !message.is_system && message.sender_id === req.user.id,
    })),
  });
});

router.post('/chats/:id/messages/read', requireRole('farmer', 'owner'), validate({ params: idParams }), async (req, res) => {
  const chat = await getServiceChat(req.valid.params.id, req.user);
  const result = await db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE recipient_id = ? AND chat_id = ? AND kind = 'service_message' AND read_at IS NULL`
  ).run(req.user.id, chat.id);
  res.json({ updated: result.changes });
});

router.post(
  '/chats/:id/messages',
  requireRole('farmer', 'owner'),
  validate({ params: idParams, body: chatMessageBody }),
  async (req, res) => {
    const chat = await getServiceChat(req.valid.params.id, req.user);
    const recipientId = chat.farmer_id === req.user.id ? chat.owner_id : chat.farmer_id;
    const recipientPhone = chat.farmer_id === req.user.id ? chat.owner_phone : chat.farmer_phone;
    const senderName = req.user.name || (req.user.role === 'farmer' ? 'A farmer' : 'A provider');
    const result = await db.transaction(async () => {
      const message = await db.prepare(
        'INSERT INTO service_chat_messages (chat_id, sender_id, body, message_language) VALUES (?, ?, ?, ?) RETURNING id'
      ).get(chat.id, req.user.id, req.valid.body.body, req.valid.body.language);
      await db.prepare('UPDATE service_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(chat.id);
      await createNotification({
        recipientId,
        actorId: req.user.id,
        chatId: chat.id,
        kind: 'service_message',
        title: 'New service message',
        body: `${senderName} sent a message about ${chat.listing_title}.`,
      });
      return message;
    })();
    sendAlert(recipientPhone);
    res.status(201).json({ id: result.id });
  }
);

router.post(
  '/chats/:id/voice',
  requireRole('farmer', 'owner'),
  validate({ params: idParams }),
  uploadVoice,
  async (req, res) => {
    if (!req.file) throw badRequest('Record a voice note before sending it');
    if (!validAudioSignature(req.file)) throw badRequest('The audio file could not be verified');
    const parsedLanguage = z.enum(['en', 'te', 'hi']).safeParse(req.body.language || 'en');
    if (!parsedLanguage.success) throw badRequest('Choose English, Telugu, or Hindi for this voice note');
    const chat = await getServiceChat(req.valid.params.id, req.user);
    const recipientId = chat.farmer_id === req.user.id ? chat.owner_id : chat.farmer_id;
    const recipientPhone = chat.farmer_id === req.user.id ? chat.owner_phone : chat.farmer_phone;
    const mime = req.file.mimetype.toLowerCase().split(';')[0];
    const result = await db.transaction(async () => {
      const message = await db.prepare(
        `INSERT INTO service_chat_messages
           (chat_id, sender_id, body, message_language, audio_mime, audio_data)
         VALUES (?, ?, '', ?, ?, ?) RETURNING id`
      ).get(chat.id, req.user.id, parsedLanguage.data, mime, req.file.buffer);
      await db.prepare('UPDATE service_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(chat.id);
      await createNotification({
        recipientId,
        actorId: req.user.id,
        chatId: chat.id,
        kind: 'service_message',
        title: 'New voice note',
        body: `A voice note was sent about ${chat.listing_title}.`,
      });
      return message;
    })();
    sendAlert(recipientPhone);
    res.status(201).json({ id: result.id });
  }
);

router.get(
  '/chats/:id/messages/:messageId/audio',
  requireRole('farmer', 'owner'),
  validate({ params: z.object({ id: z.coerce.number().int().positive(), messageId: z.coerce.number().int().positive() }) }),
  async (req, res) => {
    const chat = await getServiceChat(req.valid.params.id, req.user);
    const audio = await db.prepare(
      'SELECT audio_mime, audio_data FROM service_chat_messages WHERE id = ? AND chat_id = ? AND audio_data IS NOT NULL'
    ).get(req.valid.params.messageId, chat.id);
    if (!audio) throw notFound('Voice note not found');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(audio.audio_mime).send(audio.audio_data);
  }
);

router.post('/notifications/read-all', requireRole('farmer', 'owner'), async (req, res) => {
  const result = await db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE recipient_id = ? AND read_at IS NULL`
  ).run(req.user.id);
  res.json({ updated: result.changes });
});

router.post(
  '/notifications/:id/read',
  requireRole('farmer', 'owner'),
  validate({ params: idParams }),
  async (req, res) => {
    const result = await db.prepare(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND recipient_id = ? AND read_at IS NULL`
    ).run(req.valid.params.id, req.user.id);
    res.json({ updated: result.changes });
  }
);

router.get(
  '/bookings/:id/messages',
  requireRole('farmer', 'owner'),
  validate({ params: idParams }),
  async (req, res) => {
    const booking = await getParticipantBooking(req.valid.params.id, req.user);
    const messages = await db.prepare(
      `SELECT m.id, m.sender_id, m.body, m.created_at,
              COALESCE(u.business_name, u.name, u.phone) AS sender_name,
              u.role AS sender_role
         FROM booking_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.booking_id = ?
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT 200`
    ).all(booking.id);
    res.json({
      booking: { id: booking.id, title: booking.item_title, status: booking.status },
      items: messages.map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name,
        senderRole: message.sender_role,
        body: message.body,
        createdAt: message.created_at,
        isMine: message.sender_id === req.user.id,
      })),
    });
  }
);

router.post(
  '/bookings/:id/messages/read',
  requireRole('farmer', 'owner'),
  validate({ params: idParams }),
  async (req, res) => {
    const booking = await getParticipantBooking(req.valid.params.id, req.user);
    const result = await db.prepare(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE recipient_id = ? AND booking_id = ? AND kind = 'booking_message' AND read_at IS NULL`
    ).run(req.user.id, booking.id);
    res.json({ updated: result.changes });
  }
);

router.post(
  '/bookings/:id/messages',
  requireRole('farmer', 'owner'),
  validate({
    params: idParams,
    body: z.object({ body: z.string().trim().min(1).max(2000) }),
  }),
  async (req, res) => {
    const booking = await getParticipantBooking(req.valid.params.id, req.user);
    const recipientId = booking.farmer_id === req.user.id ? booking.owner_id : booking.farmer_id;
    const recipientPhone = booking.farmer_id === req.user.id ? booking.owner_phone : booking.farmer_phone;
    const created = await db.transaction(async () => {
      const result = await db.prepare(
        'INSERT INTO booking_messages (booking_id, sender_id, body) VALUES (?, ?, ?)'
      ).run(booking.id, req.user.id, req.valid.body.body);
      await createNotification({
        recipientId,
        actorId: req.user.id,
        bookingId: booking.id,
        kind: 'booking_message',
        title: 'New booking message',
        body: `New message about ${booking.item_title}.`,
      });
      return result;
    })();
    sendAlert(recipientPhone);
    res.status(201).json({ id: created.lastInsertRowid });
  }
);

module.exports = router;
