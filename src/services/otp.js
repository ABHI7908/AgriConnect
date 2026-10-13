'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { AppError } = require('../utils/errors');
const { sendOtpSms } = require('./sms');

const nowSec = () => Math.floor(Date.now() / 1000);

function hashCode(phone, role, code) {
  return crypto.createHmac('sha256', config.OTP_PEPPER).update(`${phone}|${role}|${code}`).digest('hex');
}

function generateCode() {
  const max = 10 ** config.OTP_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(config.OTP_LENGTH, '0');
}

const latestStmt = db.prepare(
  `SELECT * FROM otp_codes WHERE phone = ? AND role = ? ORDER BY id DESC LIMIT 1`
);
const countHourStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND role = ? AND created_at > ?`
);
const countAllHourStmt = db.prepare(`SELECT COUNT(*) AS n FROM otp_codes WHERE created_at > ?`);
const invalidateStmt = db.prepare(
  `UPDATE otp_codes SET consumed = 1 WHERE phone = ? AND role = ? AND consumed = 0`
);
const insertStmt = db.prepare(
  `INSERT INTO otp_codes (phone, role, code_hash, expires_at, created_at, ip) VALUES (?, ?, ?, ?, ?, ?)`
);
const deleteStmt = db.prepare(`DELETE FROM otp_codes WHERE id = ?`);
const bumpAttemptsStmt = db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`);
const consumeStmt = db.prepare(`UPDATE otp_codes SET consumed = 1 WHERE id = ? AND consumed = 0`);

async function requestOtp(phone, role, ip) {
  const now = nowSec();

  const last = await latestStmt.get(phone, role);
  if (last && now - last.created_at < config.OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = config.OTP_RESEND_COOLDOWN_SECONDS - (now - last.created_at);
    throw new AppError(429, `Please wait ${wait}s before requesting another OTP`, 'OTP_COOLDOWN', { retryAfter: wait });
  }
  const { n } = await countHourStmt.get(phone, role, now - 3600);
  if (n >= config.OTP_MAX_PER_HOUR) {
    throw new AppError(429, 'Too many OTP requests for this number. Please try again later.', 'OTP_LIMIT');
  }

  // Global circuit breaker: if OTP volume across all numbers spikes (SMS pumping), stop sending.
  if (config.OTP_GLOBAL_MAX_PER_HOUR > 0) {
    const { n: total } = await countAllHourStmt.get(now - 3600);
    if (total >= config.OTP_GLOBAL_MAX_PER_HOUR) {
      // eslint-disable-next-line no-console
      console.error(`OTP global hourly cap (${config.OTP_GLOBAL_MAX_PER_HOUR}) reached; refusing to send more SMS.`);
      throw new AppError(503, 'We are receiving a lot of requests right now. Please try again later.', 'OTP_BUSY');
    }
  }

  const code = generateCode();
  const id = await db.transaction(async () => {
    await invalidateStmt.run(phone, role);
    return (await insertStmt.run(phone, role, hashCode(phone, role, code), now + config.OTP_TTL_SECONDS, now, ip || null))
      .lastInsertRowid;
  })();

  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    await deleteStmt.run(id);
    throw err;
  }

  const result = { expiresInSec: config.OTP_TTL_SECONDS, resendInSec: config.OTP_RESEND_COOLDOWN_SECONDS };
  // Convenience for local development only. Never exposed in production (config.js forbids console SMS there).
  if (config.SMS_PROVIDER === 'console' && !config.isProd) result.devOtp = code;
  return result;
}

async function verifyOtp(phone, role, code) {
  const row = await latestStmt.get(phone, role);
  const invalid = () => new AppError(400, 'Invalid or expired OTP', 'OTP_INVALID');

  if (!row || row.consumed || row.expires_at < nowSec()) throw invalid();
  if (row.attempts >= config.OTP_MAX_ATTEMPTS) {
    throw new AppError(429, 'Too many wrong attempts. Please request a new OTP.', 'OTP_ATTEMPTS');
  }

  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(hashCode(phone, role, String(code)), 'hex');
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!ok) {
    await bumpAttemptsStmt.run(row.id);
    throw invalid();
  }
  // Atomic single-use: only one concurrent verification can flip consumed 0 -> 1.
  if ((await consumeStmt.run(row.id)).changes !== 1) throw invalid();
}

/** Remove OTP rows older than a day. Called periodically from server.js. */
async function purgeOldOtps() {
  return (await db.prepare(`DELETE FROM otp_codes WHERE created_at < ?`).run(nowSec() - 86400)).changes;
}

module.exports = { requestOtp, verifyOtp, purgeOldOtps };
