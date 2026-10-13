'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { BOOKING_STATUSES } = require('../constants');
const { validate } = require('../middleware/validate');
const { requireRole, requireAuth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { AppError, badRequest, notFound, forbidden, conflict } = require('../utils/errors');
const S = require('../utils/schemas');
const { createNotification, sendAlert } = require('../services/notifications');
const { ensureServiceChat } = require('../services/service-chats');

const router = express.Router();
router.use(requireAuth);

const idParams = z.object({ id: S.id });
const DAY_MS = 86400000;
const SHARE_CONTACT_STATUSES = ['accepted', 'in_progress', 'completed'];
const paymentAmount = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(amount);

/* ------------------------------------------------------------- Helpers */

const daysBetween = (start, end) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;

function estimateTool(tool, days, acres) {
  if (tool.price_per_acre && acres) return Math.round(tool.price_per_acre * acres);
  if (tool.price_per_day) return Math.round(tool.price_per_day * days);
  if (tool.price_per_hour) return Math.round(tool.price_per_hour * 8 * days); // assumes an 8-hour working day
  return null;
}

async function overlapsExistingBooking(toolId, start, end, excludeId = 0) {
  return !!(await db
    .prepare(
      `SELECT 1 FROM bookings
        WHERE tool_id = ? AND id != ? AND status IN ('accepted','in_progress')
          AND start_date <= ? AND end_date >= ? LIMIT 1`
    )
    .get(toolId, excludeId, end, start));
}

function bookingDto(b, viewerRole) {
  const share = SHARE_CONTACT_STATUSES.includes(b.status);
  const counterpart =
    viewerRole === 'farmer'
      ? {
          id: b.owner_id,
          name: b.owner_business || b.owner_name,
          village: b.owner_village,
          district: b.owner_district,
          phone: share ? b.owner_phone : null,
        }
      : {
          id: b.farmer_id,
          name: b.farmer_name,
          village: b.farmer_village,
          district: b.farmer_district,
          phone: share ? b.farmer_phone : null,
        };
  return {
    id: b.id,
    kind: b.kind,
    toolId: b.tool_id,
    labourId: b.labour_id,
    itemTitle: b.item_title,
    startDate: b.start_date,
    endDate: b.end_date,
    landAcres: b.land_acres,
    workAddress: b.work_address,
    workLat: b.work_lat,
    workLng: b.work_lng,
    notes: b.notes,
    quotedAmount: b.quoted_amount,
    finalAmount: b.final_amount,
    status: b.status,
    rating: b.rating,
    review: b.review,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    completedAt: b.completed_at,
    counterpart,
  };
}

const SELECT_BOOKING = `
  SELECT b.*,
         f.name AS farmer_name, f.phone AS farmer_phone, f.village AS farmer_village, f.district AS farmer_district,
         o.name AS owner_name, o.business_name AS owner_business, o.phone AS owner_phone,
         o.village AS owner_village, o.district AS owner_district
    FROM bookings b
    JOIN users f ON f.id = b.farmer_id
    JOIN users o ON o.id = b.owner_id`;

const loadBooking = (id) => db.prepare(`${SELECT_BOOKING} WHERE b.id = ?`).get(id);

function assertParticipant(booking, user) {
  if (user.role === 'admin') return;
  if (booking.farmer_id !== user.id && booking.owner_id !== user.id) throw forbidden();
}

/* ------------------------------------------------------------- Create */

const createBody = z
  .object({
    kind: z.enum(['tool', 'labour']),
    toolId: S.id.optional(),
    labourId: S.id.optional(),
    startDate: S.isoDate,
    endDate: S.isoDate,
    landAcres: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(0.01).max(100000).optional()),
    workAddress: S.text(300),
    workLat: S.lat.optional(),
    workLng: S.lng.optional(),
    notes: S.text(1000),
  })
  .refine((v) => (v.kind === 'tool' ? !!v.toolId : !!v.labourId), {
    message: 'Select what you want to book',
    path: ['kind'],
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date cannot be before start date', path: ['endDate'] });

router.post('/', requireRole('farmer'), validate({ body: createBody }), async (req, res) => {
  const b = req.valid.body;

  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  if (b.startDate < yesterday) throw badRequest('Start date cannot be in the past');
  const days = daysBetween(b.startDate, b.endDate);
  if (days > 120) throw badRequest('A single booking can span at most 120 days');

  let ownerId;
  let title;
  let quoted = null;

  if (b.kind === 'tool') {
    const tool = await db
      .prepare(
        `SELECT t.*, u.status AS owner_status FROM tools t JOIN users u ON u.id = t.owner_id WHERE t.id = ?`
      )
      .get(b.toolId);
    if (!tool || tool.status !== 'approved' || tool.owner_status !== 'active') throw notFound('Tool not found');
    if (!tool.available) throw conflict('This tool is currently not available');
    if (await overlapsExistingBooking(tool.id, b.startDate, b.endDate)) {
      throw conflict('This tool is already booked for some of those dates. Please choose other dates.');
    }
    ownerId = tool.owner_id;
    title = tool.name;
    quoted = estimateTool(tool, days, b.landAcres);
  } else {
    const l = await db
      .prepare(
        `SELECT l.*, u.status AS owner_status FROM labour_listings l JOIN users u ON u.id = l.provider_id WHERE l.id = ?`
      )
      .get(b.labourId);
    if (!l || l.status !== 'approved' || l.owner_status !== 'active') throw notFound('Labour listing not found');
    if (!l.available) throw conflict('This labour team is currently not available');
    ownerId = l.provider_id;
    title = l.title;
    quoted = Math.round(l.wage_per_day * l.team_size * days);
  }

  const duplicate = await db
    .prepare(
      `SELECT 1 FROM bookings WHERE farmer_id = ? AND status = 'requested'
          AND COALESCE(tool_id, 0) = ? AND COALESCE(labour_id, 0) = ?
          AND start_date <= ? AND end_date >= ? LIMIT 1`
    )
    .get(req.user.id, b.toolId ?? 0, b.labourId ?? 0, b.endDate, b.startDate);
  if (duplicate) throw conflict('You already have a pending request for these dates');

  const bookingId = await db.transaction(async () => {
    const info = await db
      .prepare(
        `INSERT INTO bookings (kind, farmer_id, owner_id, tool_id, labour_id, item_title, start_date, end_date,
                land_acres, work_address, work_lat, work_lng, notes, quoted_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.kind, req.user.id, ownerId, b.toolId ?? null, b.labourId ?? null, title, b.startDate, b.endDate,
        b.landAcres ?? null, b.workAddress ?? null, b.workLat ?? null, b.workLng ?? null, b.notes ?? null, quoted
      );
    const serviceChat = await ensureServiceChat({
      farmerId: req.user.id,
      ownerId,
      kind: b.kind,
      listingId: b.kind === 'tool' ? b.toolId : b.labourId,
    });
    await db.prepare(
      'INSERT INTO service_chat_messages (chat_id, sender_id, body, is_system) VALUES (?, NULL, ?, 1)'
    ).run(
      serviceChat.id,
      `Booking request raised for ${title}.${quoted == null ? '' : ` Estimated amount: ${paymentAmount(quoted)}.`}`
    );
    await createNotification({
      recipientId: ownerId,
      actorId: req.user.id,
      bookingId: info.lastInsertRowid,
      chatId: serviceChat.id,
      kind: 'booking_request',
      title: 'New booking request',
      body: `A farmer requested ${title}.`,
    });
    return info.lastInsertRowid;
  })();

  const booking = await loadBooking(bookingId);
  sendAlert(booking.owner_phone);
  audit(req, 'booking.created', { entity: 'booking', entityId: bookingId, meta: { kind: b.kind, title } });
  res.status(201).json({ booking: bookingDto(booking, 'farmer') });
});

/* --------------------------------------------------------------- List */

const listQuery = z.object({
  status: z.enum([...BOOKING_STATUSES, 'active', 'history']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/', requireRole('farmer', 'owner'), validate({ query: listQuery }), async (req, res) => {
  const { status, page, pageSize } = req.valid.query;
  const col = req.user.role === 'farmer' ? 'b.farmer_id' : 'b.owner_id';
  const where = [`${col} = ?`];
  const args = [req.user.id];
  if (status === 'active') {
    where.push("b.status IN ('requested', 'accepted', 'in_progress')");
  } else if (status === 'history') {
    where.push("b.status IN ('completed', 'rejected', 'cancelled')");
  } else if (status) {
    where.push('b.status = ?');
    args.push(status);
  }
  const { total } = await db.prepare(`SELECT COUNT(*) AS total FROM bookings b WHERE ${where.join(' AND ')}`).get(...args);
  const rows = await db
    .prepare(`${SELECT_BOOKING} WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize);

  res.json({ total, page, pageSize, items: rows.map((r) => bookingDto(r, req.user.role)) });
});

/* ------------------------------------------- History summaries (by user) */

router.get('/summary', requireRole('farmer', 'owner'), async (req, res) => {
  if (req.user.role === 'farmer') {
    const totals = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(status = 'completed') AS completed,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(final_amount, quoted_amount) END), 0) AS spent
           FROM bookings WHERE farmer_id = ?`
      )
      .get(req.user.id);
    const providers = await db
      .prepare(
        `SELECT o.id AS ownerId, COALESCE(o.business_name, o.name) AS name, o.village AS village,
                COUNT(*) AS bookings, SUM(b.status = 'completed') AS completed,
                COALESCE(SUM(CASE WHEN b.status = 'completed' THEN COALESCE(b.final_amount, b.quoted_amount) END), 0) AS spent,
                MAX(b.start_date) AS lastUsed, GROUP_CONCAT(DISTINCT b.item_title) AS services
           FROM bookings b JOIN users o ON o.id = b.owner_id
          WHERE b.farmer_id = ? AND b.status IN ('accepted','in_progress','completed')
          GROUP BY o.id ORDER BY lastUsed DESC`
      )
      .all(req.user.id);
    return res.json({
      role: 'farmer',
      totals: { total: totals.total, completed: totals.completed || 0, spent: totals.spent },
      providers: providers.map((p) => ({ ...p, services: (p.services || '').split(',').filter(Boolean) })),
    });
  }

  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(status = 'requested') AS pending,
              SUM(status = 'completed') AS completed,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(final_amount, quoted_amount) END), 0) AS earned
         FROM bookings WHERE owner_id = ?`
    )
    .get(req.user.id);
  const customers = await db
    .prepare(
      `SELECT f.id AS farmerId, f.name AS name, f.village AS village, f.district AS district, f.phone AS phone,
              COUNT(*) AS bookings, SUM(b.status = 'completed') AS completed,
              COALESCE(SUM(CASE WHEN b.status = 'completed' THEN COALESCE(b.final_amount, b.quoted_amount) END), 0) AS earned,
              MAX(b.start_date) AS lastService, GROUP_CONCAT(DISTINCT b.item_title) AS services
         FROM bookings b JOIN users f ON f.id = b.farmer_id
        WHERE b.owner_id = ? AND b.status IN ('accepted','in_progress','completed')
        GROUP BY f.id ORDER BY lastService DESC`
    )
    .all(req.user.id);
  return res.json({
    role: 'owner',
    totals: { total: totals.total, pending: totals.pending || 0, completed: totals.completed || 0, earned: totals.earned },
    customers: customers.map((c) => ({ ...c, services: (c.services || '').split(',').filter(Boolean) })),
  });
});

/* ------------------------------------------------------------- Detail */

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const row = await loadBooking(req.valid.params.id);
  if (!row) throw notFound('Booking not found');
  assertParticipant(row, req.user);
  res.json({ booking: bookingDto(row, req.user.role === 'owner' ? 'owner' : 'farmer') });
});

/* ------------------------------------------------------- Status changes */

const OWNER_TRANSITIONS = {
  requested: ['accepted', 'rejected'],
  accepted: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed'],
};
const FARMER_TRANSITIONS = {
  requested: ['cancelled'],
  accepted: ['cancelled'],
};

router.patch(
  '/:id/status',
  requireRole('farmer', 'owner'),
  validate({
    params: idParams,
    body: z.object({
      status: z.enum(['accepted', 'rejected', 'in_progress', 'completed', 'cancelled']),
      finalAmount: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(0).max(100_000_000).optional()),
    }),
  }),
  async (req, res) => {
    const row = await loadBooking(req.valid.params.id);
    if (!row) throw notFound('Booking not found');
    assertParticipant(row, req.user);

    const { status, finalAmount } = req.valid.body;
    const table = req.user.role === 'owner' ? OWNER_TRANSITIONS : FARMER_TRANSITIONS;
    if (!(table[row.status] || []).includes(status)) {
      throw new AppError(409, `A booking that is "${row.status}" cannot be changed to "${status}"`, 'BAD_TRANSITION');
    }

    const recipientId = req.user.role === 'farmer' ? row.owner_id : row.farmer_id;
    const recipientPhone = req.user.role === 'farmer' ? row.owner_phone : row.farmer_phone;
    const actorName = req.user.business_name || req.user.name || (req.user.role === 'farmer' ? 'Farmer' : 'Provider');
    const amount = status === 'completed' ? (finalAmount ?? row.final_amount ?? row.quoted_amount) : null;
    const statusTitle = {
      accepted: 'Booking accepted',
      rejected: 'Booking rejected',
      in_progress: 'Work started',
      completed: 'Work completed',
      cancelled: 'Booking cancelled',
    }[status];
    const applyStatus = async () => {
      const result = await db.prepare(
        `UPDATE bookings SET status = ?,
                final_amount = CASE WHEN ? = 'completed' THEN COALESCE(?, quoted_amount) ELSE final_amount END,
                completed_at = CASE WHEN ? = 'completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE completed_at END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND status = ?`
      ).run(status, status, finalAmount ?? null, status, row.id, row.status);
      if (result.changes !== 1) {
        throw new AppError(409, 'This booking was just updated by someone else. Please refresh.', 'BAD_TRANSITION');
      }
      const chat = await ensureServiceChat({
        farmerId: row.farmer_id,
        ownerId: row.owner_id,
        kind: row.kind,
        listingId: row.kind === 'tool' ? row.tool_id : row.labour_id,
      });
      const eventText = status === 'completed'
        ? `Work completed for ${row.item_title}.`
        : `${statusTitle} for ${row.item_title}.`;
      await db.prepare(
        'INSERT INTO service_chat_messages (chat_id, sender_id, body, is_system) VALUES (?, NULL, ?, 1)'
      ).run(chat.id, eventText);
      await createNotification({
        recipientId,
        actorId: req.user.id,
        bookingId: row.id,
        chatId: chat.id,
        kind: 'booking_status',
        title: statusTitle,
        body: `${actorName} ${status === 'completed' ? 'marked the work completed' : `updated the booking to ${status.replace(/_/g, ' ')}`} for ${row.item_title}.`,
      });
      if (status === 'completed' && amount != null) {
        const paymentText = `Final payment recorded for ${row.item_title}: ${paymentAmount(amount)}.`;
        await db.prepare(
          'INSERT INTO service_chat_messages (chat_id, sender_id, body, is_system) VALUES (?, NULL, ?, 1)'
        ).run(chat.id, paymentText);
        await createNotification({
          recipientId,
          actorId: req.user.id,
          bookingId: row.id,
          chatId: chat.id,
          kind: 'booking_status',
          title: 'Final payment recorded',
          body: `${actorName} recorded a final payment of ${paymentAmount(amount)} for ${row.item_title}.`,
        });
      }
    };

    if (status === 'accepted' && row.tool_id) {
      await db.transaction(async () => {
        await db.prepare('SELECT id FROM tools WHERE id = ? FOR UPDATE').get(row.tool_id);
        if (await overlapsExistingBooking(row.tool_id, row.start_date, row.end_date, row.id)) {
          throw conflict('You already have another confirmed booking for this tool on those dates');
        }
        await applyStatus();
      })();
    } else {
      await db.transaction(async () => applyStatus())();
    }

    sendAlert(recipientPhone);
    audit(req, `booking.${status}`, { entity: 'booking', entityId: row.id, meta: { from: row.status } });
    res.json({ booking: bookingDto(await loadBooking(row.id), req.user.role) });
  }
);

/* -------------------------------------------------------------- Review */

router.post(
  '/:id/review',
  requireRole('farmer'),
  validate({
    params: idParams,
    body: z.object({ rating: z.coerce.number().int().min(1).max(5), review: S.text(600) }),
  }),
  async (req, res) => {
    const row = await loadBooking(req.valid.params.id);
    if (!row) throw notFound('Booking not found');
    if (row.farmer_id !== req.user.id) throw forbidden();
    if (row.status !== 'completed') throw conflict('You can review a service after it is completed');
    if (row.rating) throw conflict('You have already reviewed this service');

    const { rating, review } = req.valid.body;
    await db.prepare(
      `UPDATE bookings SET rating = ?, review = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(rating, review ?? null, row.id);
    audit(req, 'booking.reviewed', { entity: 'booking', entityId: row.id, meta: { rating } });
    res.json({ booking: bookingDto(await loadBooking(row.id), 'farmer') });
  }
);

module.exports = router;
