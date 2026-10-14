'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const db = require('../db');
const limits = require('../middleware/rateLimit');
const { AppError, badRequest, notFound } = require('../utils/errors');
const { audit } = require('../utils/audit');

const router = express.Router();
const COOKIE = 'agri_db_manager';
const SESSION_MS = 2 * 60 * 60 * 1000;

const tables = Object.freeze({
  users: {
    label: 'User accounts',
    hidden: ['password_hash', 'token_version'],
    editable: [
      'phone', 'email', 'name', 'business_name', 'village', 'district', 'state', 'address',
      'lat', 'lng', 'status', 'profile_complete',
    ],
    search: ['phone', 'email', 'name', 'business_name', 'village', 'district', 'state'],
    excludeAdmins: true,
  },
  tools: {
    label: 'Machine listings',
    editable: [
      'owner_id', 'category', 'name', 'brand', 'model', 'year', 'description', 'price_per_hour',
      'price_per_day', 'price_per_acre', 'with_operator', 'village', 'district', 'state', 'address',
      'lat', 'lng', 'service_radius_km', 'available', 'status', 'admin_note',
    ],
    search: ['category', 'name', 'brand', 'model', 'description', 'village', 'district', 'state'],
  },
  tool_images: {
    label: 'Machine photos',
    hidden: ['data'],
    editable: ['position'],
    search: ['filename', 'mime'],
  },
  labour_listings: {
    label: 'Labour listings',
    editable: [
      'provider_id', 'title', 'skill', 'team_size', 'wage_per_day', 'description', 'village',
      'district', 'state', 'address', 'lat', 'lng', 'service_radius_km', 'available', 'status', 'admin_note',
    ],
    search: ['title', 'skill', 'description', 'village', 'district', 'state'],
  },
  bookings: {
    label: 'Bookings',
    editable: [
      'kind', 'farmer_id', 'owner_id', 'tool_id', 'labour_id', 'item_title', 'start_date', 'end_date',
      'land_acres', 'work_address', 'work_lat', 'work_lng', 'notes', 'quoted_amount', 'final_amount',
      'status', 'rating', 'review', 'completed_at',
    ],
    search: ['kind', 'item_title', 'work_address', 'notes', 'status', 'review'],
  },
  crops: {
    label: 'Crops',
    editable: ['name', 'yield_per_acre_kg', 'default_price_per_quintal', 'notes', 'active'],
    search: ['name', 'notes'],
  },
  saved_calculations: {
    label: 'Saved calculations',
    editable: [
      'label', 'crop', 'area_acres', 'yield_per_acre_kg', 'bag_weight_kg', 'total_kg', 'bags',
      'price_per_quintal', 'revenue', 'polygon',
    ],
    search: ['label', 'crop'],
  },
  audit_logs: {
    label: 'Audit records (read only)',
    editable: [],
    search: ['actor_role', 'action', 'entity', 'meta', 'ip'],
    readOnly: true,
  },
});

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.isProd,
  path: '/api/database-manager',
  maxAge: SESSION_MS,
});

function digest(value) {
  return crypto.createHash('sha256').update(value).digest();
}

function credentialVersion() {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(config.DB_MANAGER_PASSWORD || '').digest('hex');
}

function validCredentials(email, password) {
  const configured = Boolean(config.DB_MANAGER_EMAIL && config.DB_MANAGER_PASSWORD);
  const emailMatches = crypto.timingSafeEqual(
    digest(email.toLowerCase()),
    digest((config.DB_MANAGER_EMAIL || '').trim().toLowerCase())
  );
  const passwordMatches = crypto.timingSafeEqual(
    digest(password),
    digest(config.DB_MANAGER_PASSWORD || '')
  );
  return configured && emailMatches && passwordMatches;
}

function requireDatabaseManager(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next(new AppError(401, 'Sign in to the database manager', 'UNAUTHENTICATED'));
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    const expectedEmail = (config.DB_MANAGER_EMAIL || '').trim().toLowerCase();
    if (
      payload.scope !== 'database-manager' ||
      payload.email !== expectedEmail ||
      payload.credentialVersion !== credentialVersion() ||
      !expectedEmail
    ) {
      throw new Error('Invalid database manager session');
    }
    req.dbManagerEmail = payload.email;
  } catch (_) {
    return next(new AppError(401, 'Your database manager session has expired. Please sign in again.', 'UNAUTHENTICATED'));
  }
  return next();
}

async function getTable(name) {
  const table = tables[name];
  if (!table) throw notFound('Unknown database table');
  const schema = await db.prepare(
    `SELECT c.column_name AS name, c.data_type AS type,
            (c.is_nullable = 'YES') AS nullable, c.column_default AS default_value,
            EXISTS (
              SELECT 1 FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
             WHERE tc.table_schema = current_schema() AND tc.table_name = c.table_name
               AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = c.column_name
            ) AS primary_key
       FROM information_schema.columns c
      WHERE c.table_schema = current_schema() AND c.table_name = ?
      ORDER BY c.ordinal_position`
  ).all(name);
  const hidden = new Set(table.hidden || []);
  const columns = schema
    .filter((column) => !hidden.has(column.name))
    .map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      writable: table.editable.includes(column.name),
      defaultValue: column.default_value,
      primaryKey: column.primary_key,
    }));
  if (name === 'users') {
    columns.push({
      name: 'password_status',
      type: 'text',
      nullable: false,
      writable: false,
      defaultValue: null,
      primaryKey: false,
    });
  }
  return { ...table, columns };
}

function selectColumn(name, column) {
  if (name === 'users' && column.name === 'password_status') {
    return `CASE WHEN "password_hash" IS NOT NULL AND "password_hash" <> '' THEN 'Set (bcrypt hash)' ELSE 'Not set' END AS "password_status"`;
  }
  return `"${column.name}"`;
}

function listPredicate(table, query) {
  const clauses = [];
  const args = [];
  if (table.excludeAdmins) clauses.push(`"role" != 'admin'`);
  if (query) {
    const search = table.search
      .filter((column) => table.columns.some((visible) => visible.name === column))
      .map((column) => `CAST("${column}" AS TEXT) LIKE ? ESCAPE '\\'`);
    if (search.length) {
      clauses.push(`(${search.join(' OR ')})`);
      const escaped = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      search.forEach(() => args.push(escaped));
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', args };
}

function asDatabaseValue(value, column) {
  if (value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw badRequest(`Invalid value for ${column.name}`);
  }
  if (/INT|REAL|FLOA|DOUB|NUM/i.test(column.type)) {
    if (value === '') {
      if (column.nullable) return null;
      throw badRequest(`${column.name} is required`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || (/INT/i.test(column.type) && !Number.isInteger(number))) {
      throw badRequest(`${column.name} must be a valid ${/INT/i.test(column.type) ? 'integer' : 'number'}`);
    }
    return number;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value);
}

router.post(
  '/login',
  limits.adminLogin,
  (req, res, next) => {
    const input = z.object({
      email: z.string().trim().email().max(254),
      password: z.string().min(1).max(200),
    }).safeParse(req.body);
    if (!input.success) return next(badRequest('Enter a valid email and password'));
    const { email, password } = input.data;
    if (!validCredentials(email, password)) {
      return next(new AppError(401, 'Incorrect database manager email or password', 'BAD_CREDENTIALS'));
    }
    const token = jwt.sign(
      {
        scope: 'database-manager',
        email: config.DB_MANAGER_EMAIL.trim().toLowerCase(),
        credentialVersion: credentialVersion(),
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '2h' }
    );
    res.cookie(COOKIE, token, cookieOptions());
    audit(req, 'database_manager.login', {
      actor: { id: null, role: 'database_manager' },
      meta: { email: config.DB_MANAGER_EMAIL.trim().toLowerCase() },
    });
    return res.json({ email: config.DB_MANAGER_EMAIL.trim().toLowerCase() });
  }
);

router.post('/logout', (req, res) => {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE, options);
  res.json({ ok: true });
});

router.use(requireDatabaseManager);

router.get('/session', (req, res) => {
  res.json({ email: config.DB_MANAGER_EMAIL.trim().toLowerCase() });
});

router.get('/tables', (req, res) => {
  res.json({
    items: Object.entries(tables).map(([name, table]) => ({ name, label: table.label, readOnly: Boolean(table.readOnly) })),
  });
});

router.get('/:table/export', async (req, res, next) => {
  try {
    const table = await getTable(req.params.table);
    const query = z.string().trim().max(100).catch('').parse(req.query.q);
    const { where, args } = listPredicate(table, query);
    const rows = await db.prepare(
      `SELECT ${table.columns.map((column) => selectColumn(req.params.table, column)).join(', ')}
         FROM "${req.params.table}" ${where} ORDER BY "id" DESC LIMIT 50001`
    ).all(...args);
    if (rows.length > 50000) {
      throw new AppError(413, 'Export is limited to 50,000 rows. Narrow your search and try again.', 'EXPORT_LIMIT');
    }
    const csvCell = (value) => {
      let text = value == null ? '' : String(value);
      if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = table.columns.map((column) => column.name);
    const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
      .map((line) => line.map(csvCell).join(','))
      .join('\r\n');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.table}.csv"`);
    audit(req, 'database_manager.records_exported', {
      actor: { id: null, role: 'database_manager' },
      entity: req.params.table,
      meta: { email: req.dbManagerEmail, count: rows.length, filtered: Boolean(query) },
    });
    res.type('text/csv; charset=utf-8').send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:table/rows', async (req, res, next) => {
  try {
    const table = await getTable(req.params.table);
    const parsedQuery = z.object({
      q: z.string().trim().max(100).optional().default(''),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(25),
    }).safeParse(req.query);
    if (!parsedQuery.success) throw badRequest('Invalid table search or page settings');
    const query = parsedQuery.data;
    const { where, args } = listPredicate(table, query.q);
    const selectedColumns = table.columns.map((column) => selectColumn(req.params.table, column)).join(', ');
    const total = (await db.prepare(`SELECT COUNT(*) AS n FROM "${req.params.table}" ${where}`).get(...args)).n;
    const items = await db.prepare(
      `SELECT ${selectedColumns} FROM "${req.params.table}" ${where}
       ORDER BY "id" DESC LIMIT ? OFFSET ?`
    ).all(...args, query.pageSize, (query.page - 1) * query.pageSize);
    res.json({
      table: { name: req.params.table, label: table.label, readOnly: Boolean(table.readOnly), columns: table.columns },
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/password', limits.databaseManagerPasswordChange, async (req, res, next) => {
  try {
    const parsedId = Number(req.params.id);
    if (!Number.isSafeInteger(parsedId) || parsedId < 1) throw badRequest('Invalid user ID');
    const input = z.object({
      password: z.string().min(8).max(200),
      confirmPassword: z.string().min(8).max(200),
    }).refine((value) => value.password === value.confirmPassword, {
      message: 'The passwords do not match',
      path: ['confirmPassword'],
    }).safeParse(req.body);
    if (!input.success) throw badRequest(input.error.issues[0]?.message || 'Enter a valid password');

    const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(parsedId);
    if (!user || user.role === 'admin') throw notFound('User account not found');

    const passwordHash = await bcrypt.hash(input.data.password, 12);
    const changed = await db.prepare(
      `UPDATE users
          SET password_hash = ?, token_version = token_version + 1,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND role <> 'admin'`
    ).run(passwordHash, parsedId);
    if (changed.changes !== 1) throw notFound('User account not found');

    audit(req, 'database_manager.password_reset', {
      actor: { id: null, role: 'database_manager' },
      entity: 'user',
      entityId: parsedId,
      meta: { email: req.dbManagerEmail },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:table/:id', async (req, res, next) => {
  try {
    const table = await getTable(req.params.table);
    if (table.readOnly) throw new AppError(403, 'This table is read only', 'READ_ONLY');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw badRequest('Invalid record ID');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw badRequest('Provide fields to update');

    const updates = Object.entries(req.body);
    if (!updates.length) throw badRequest('Provide at least one field to update');
    const columns = new Map(table.columns.map((column) => [column.name, column]));
    const fields = updates.map(([name, value]) => {
      const column = columns.get(name);
      if (!column || !column.writable) throw badRequest(`The ${name} field cannot be edited`);
      return { name, value: asDatabaseValue(value, column) };
    });

    if (req.params.table === 'users') {
      const user = await db.prepare(`SELECT role FROM users WHERE id = ?`).get(id);
      if (!user || user.role === 'admin') throw notFound('User account not found');
    }
    if (table.columns.some((column) => column.name === 'updated_at')) {
      fields.push({ name: 'updated_at', value: new Date().toISOString() });
    }
    const setClause = fields.map(({ name }) => `"${name}" = ?`).join(', ');
    const result = await db.prepare(`UPDATE "${req.params.table}" SET ${setClause} WHERE "id" = ?`)
      .run(...fields.map((field) => field.value), id);
    if (!result.changes) throw notFound('Record not found');
    audit(req, 'database_manager.record_updated', {
      actor: { id: null, role: 'database_manager' },
      entity: req.params.table,
      entityId: id,
      meta: { email: req.dbManagerEmail, fields: updates.map(([name]) => name) },
    });
    res.json({ ok: true });
  } catch (err) {
    next(['23503', '23505', '23514'].includes(err.code)
      ? badRequest('The changes violate a database constraint. Check required fields and linked records.')
      : err);
  }
});

router.delete('/:table/:id', async (req, res, next) => {
  try {
    const table = await getTable(req.params.table);
    if (table.readOnly) throw new AppError(403, 'This table is read only', 'READ_ONLY');
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw badRequest('Invalid record ID');
    if (req.params.table === 'users') {
      const user = await db.prepare(`SELECT role FROM users WHERE id = ?`).get(id);
      if (!user || user.role === 'admin') throw notFound('User account not found');
    }
    const result = await db.prepare(`DELETE FROM "${req.params.table}" WHERE "id" = ?`).run(id);
    if (!result.changes) throw notFound('Record not found');
    audit(req, 'database_manager.record_deleted', {
      actor: { id: null, role: 'database_manager' },
      entity: req.params.table,
      entityId: id,
      meta: { email: req.dbManagerEmail },
    });
    res.json({ ok: true });
  } catch (err) {
    next(['23503', '23505', '23514'].includes(err.code)
      ? badRequest('This record is linked to other data and cannot be deleted.')
      : err);
  }
});

module.exports = router;
