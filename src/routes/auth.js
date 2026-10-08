'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { validate } = require('../middleware/validate');
const limits = require('../middleware/rateLimit');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { requestOtp, verifyOtp } = require('../services/otp');
const { AppError, badRequest } = require('../utils/errors');
const { audit } = require('../utils/audit');
const { phone, lat, lng, text, requiredText } = require('../utils/schemas');
const { publicUser } = require('../utils/serializers');
const { maskPhone } = require('../utils/phone');

const router = express.Router();

const roleSchema = z.enum(['farmer', 'owner']);

const findByPhoneRole = (phoneNumber, role) => db.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').get(phoneNumber, role);
const findById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const touchLogin = (id) => db.prepare(
  `UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
).run(id);
const findByEmail = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email);

// A real bcrypt hash of a random string, compared against when the admin email is unknown
// so response time does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Math.random()}`, 12);

/* ------------------------------------------------------------------ OTP */

const registrationFields = {
  phone,
  role: roleSchema,
  name: requiredText(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
};
const registrationSchema = z.object(registrationFields);
const registrationOtpSchema = z.object({
  ...registrationFields,
  code: z.string().trim().regex(new RegExp(`^\\d{${config.OTP_LENGTH}}$`), `Enter the ${config.OTP_LENGTH}-digit OTP`),
});

router.post(
  '/register/otp/request',
  limits.otpRequest,
  validate({ body: registrationSchema }),
  async (req, res) => {
    const { phone: ph, role, email } = req.valid.body;
    if (await findByPhoneRole(ph, role)) {
      throw new AppError(409, 'An account already exists for this mobile number. Please log in.', 'ACCOUNT_EXISTS');
    }
    if (await findByEmail(email)) {
      throw new AppError(409, 'An account already exists for this email address. Please log in.', 'EMAIL_EXISTS');
    }

    const result = await requestOtp(ph, role, req.ip);
    audit(req, 'auth.registration_otp_requested', { meta: { role, phone: maskPhone(ph) } });
    res.json({ ok: true, ...result });
  }
);

router.post(
  '/register/verify',
  limits.otpVerify,
  validate({ body: registrationOtpSchema }),
  async (req, res) => {
    const { phone: ph, role, name, email, password, code } = req.valid.body;
    if (await findByPhoneRole(ph, role)) {
      throw new AppError(409, 'An account already exists for this mobile number. Please log in.', 'ACCOUNT_EXISTS');
    }
    if (await findByEmail(email)) {
      throw new AppError(409, 'An account already exists for this email address. Please log in.', 'EMAIL_EXISTS');
    }

    await verifyOtp(ph, role, code);
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      const insert = db.transaction(async () => {
        const info = await db.prepare(
          `INSERT INTO users (role, phone, email, password_hash, name, profile_complete)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(role, ph, email, passwordHash, name, role === 'farmer' ? 1 : 0);
        return findById(info.lastInsertRowid);
      });
      user = await insert();
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError(409, 'An account already exists for these details. Please log in.', 'ACCOUNT_EXISTS');
      }
      throw err;
    }

    audit(req, 'auth.register', { actor: user, entity: 'user', entityId: user.id });
    res.status(201).json({ user: publicUser(user), registered: true });
  }
);

router.post(
  '/otp/request',
  limits.otpRequest,
  validate({ body: z.object({ phone, role: roleSchema }) }),
  async (req, res) => {
    const { phone: ph, role } = req.valid.body;

    const existing = await findByPhoneRole(ph, role);
    if (!existing) {
      throw new AppError(404, 'No account found for this mobile number. Please register first.', 'ACCOUNT_NOT_FOUND');
    }
    if (existing && existing.status === 'blocked') {
      throw new AppError(403, 'This account has been blocked. Please contact support.', 'ACCOUNT_BLOCKED');
    }

    const result = await requestOtp(ph, role, req.ip);
    audit(req, 'auth.otp_requested', { actor: existing || null, meta: { role, phone: maskPhone(ph) } });
    res.json({ ok: true, ...result });
  }
);

router.post(
  '/otp/verify',
  limits.otpVerify,
  validate({
    body: z.object({
      phone,
      role: roleSchema,
      code: z.string().trim().regex(new RegExp(`^\\d{${config.OTP_LENGTH}}$`), `Enter the ${config.OTP_LENGTH}-digit OTP`),
    }),
  }),
  async (req, res) => {
    const { phone: ph, role, code } = req.valid.body;

    const user = await findByPhoneRole(ph, role);
    if (!user) {
      throw new AppError(404, 'No account found for this mobile number. Please register first.', 'ACCOUNT_NOT_FOUND');
    }
    if (user.status === 'blocked') {
      throw new AppError(403, 'This account has been blocked. Please contact support.', 'ACCOUNT_BLOCKED');
    }

    await verifyOtp(ph, role, code);
    await touchLogin(user.id);
    setSessionCookie(res, user);
    audit(req, 'auth.login', { actor: user, entity: 'user', entityId: user.id });
    res.json({ user: publicUser(user) });
  }
);

router.post(
  '/password/login',
  limits.passwordLogin,
  validate({ body: z.object({ phone, role: roleSchema, password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { phone: ph, role, password } = req.valid.body;
    const user = await findByPhoneRole(ph, role);
    const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !passwordMatches || user.status !== 'active') {
      audit(req, 'auth.password_login_failed', { meta: { role, phone: maskPhone(ph) } });
      throw new AppError(401, 'Incorrect mobile number or password', 'BAD_CREDENTIALS');
    }

    await touchLogin(user.id);
    setSessionCookie(res, user);
    audit(req, 'auth.password_login', { actor: user, entity: 'user', entityId: user.id });
    res.json({ user: publicUser(user) });
  }
);

router.post(
  '/password/reset',
  limits.otpVerify,
  validate({
    body: z.object({
      phone,
      role: roleSchema,
      code: z.string().trim().regex(new RegExp(`^\\d{${config.OTP_LENGTH}}$`), `Enter the ${config.OTP_LENGTH}-digit OTP`),
      password: z.string().min(8).max(200),
    }),
  }),
  async (req, res) => {
    const { phone: ph, role, code, password } = req.valid.body;
    const user = await findByPhoneRole(ph, role);
    if (!user) {
      throw new AppError(404, 'No account found for this mobile number. Please register first.', 'ACCOUNT_NOT_FOUND');
    }
    if (user.status === 'blocked') {
      throw new AppError(403, 'This account has been blocked. Please contact support.', 'ACCOUNT_BLOCKED');
    }

    await verifyOtp(ph, role, code);
    const passwordHash = await bcrypt.hash(password, 12);
    const changed = await db.prepare(
      `UPDATE users
          SET password_hash = ?, token_version = token_version + 1,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND status = 'active'`
    ).run(passwordHash, user.id);
    if (changed.changes !== 1) {
      throw new AppError(403, 'This account is unavailable. Please contact support.', 'ACCOUNT_BLOCKED');
    }

    audit(req, 'auth.password_reset', { actor: user, entity: 'user', entityId: user.id });
    res.json({ ok: true });
  }
);

/* ---------------------------------------------------------------- Admin */

router.post(
  '/admin/login',
  limits.adminLogin,
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { email, password } = req.valid.body;
    const admin = await db.prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'").get(email);

    const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
    if (!admin || !ok || admin.status !== 'active') {
      audit(req, 'auth.admin_login_failed', { meta: { email } });
      throw new AppError(401, 'Incorrect email or password', 'BAD_CREDENTIALS');
    }

    await touchLogin(admin.id);
    setSessionCookie(res, admin);
    audit(req, 'auth.admin_login', { actor: admin, entity: 'user', entityId: admin.id });
    res.json({ user: publicUser(admin) });
  }
);

/* -------------------------------------------------------------- Session */

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// "Log out everywhere": invalidates every issued token for this user.
router.post('/logout-all', requireAuth, async (req, res) => {
  await db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.user.id);
  clearSessionCookie(res);
  audit(req, 'auth.logout_all');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* -------------------------------------------------------------- Profile */

const profileSchema = z.object({
  name: requiredText(80),
  businessName: text(120),
  village: text(80),
  district: text(80),
  state: text(80),
  address: text(300),
  lat: lat.optional(),
  lng: lng.optional(),
});

router.put('/me', requireAuth, validate({ body: profileSchema }), async (req, res) => {
  const b = req.valid.body;
  const u = req.user;
  if (u.role === 'admin') throw badRequest('Admin profile cannot be edited here');

  const hasLocation = b.lat !== undefined && b.lng !== undefined;
  if (u.role === 'owner' && !hasLocation && (u.lat == null || u.lng == null)) {
    throw badRequest('Please set your location on the map so farmers can find you');
  }

  const lat0 = hasLocation ? b.lat : u.lat;
  const lng0 = hasLocation ? b.lng : u.lng;
  const complete = u.role === 'owner' ? (b.name && lat0 != null && lng0 != null ? 1 : 0) : b.name ? 1 : 0;

  await db.prepare(
    `UPDATE users SET name = ?, business_name = ?, village = ?, district = ?, state = ?, address = ?,
            lat = ?, lng = ?, profile_complete = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`
  ).run(
    b.name,
    b.businessName ?? null,
    b.village ?? null,
    b.district ?? null,
    b.state ?? null,
    b.address ?? null,
    lat0 ?? null,
    lng0 ?? null,
    complete,
    u.id
  );

  audit(req, 'user.profile_updated', { entity: 'user', entityId: u.id });
  res.json({ user: publicUser(await findById(u.id)) });
});

module.exports = router;
