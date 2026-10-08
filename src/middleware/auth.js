'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { unauthorized, forbidden, AppError } = require('../utils/errors');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.token_version }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${config.JWT_EXPIRES_IN_DAYS}d`,
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.JWT_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  };
}

function setSessionCookie(res, user) {
  res.cookie(config.cookieName, signToken(user), cookieOptions());
}

function clearSessionCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.cookieName, opts);
}

/** Attach req.user when a valid session cookie is present. Never rejects. */
async function loadUser(req, res, next) {
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {
    // invalid / expired token => treated as anonymous
    return next();
  }
  const user = await db.prepare(
    `SELECT id, role, phone, email, name, business_name, village, district, state, address, lat, lng,
            status, profile_complete, token_version, created_at
       FROM users WHERE id = ?`
  ).get(payload.sub);
  if (user && user.status === 'active' && user.token_version === payload.tv && user.role === payload.role) {
    req.user = user;
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  return next();
};

/**
 * CSRF defence for cookie sessions: state-changing requests must carry a custom header.
 * Browsers will not attach it on cross-site form posts, and cross-origin fetches with it
 * trigger a CORS preflight that we do not allow. Combined with SameSite=Lax cookies.
 */
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'agriconnect') {
    return next(new AppError(403, 'Missing request header', 'CSRF'));
  }
  return next();
}

/** Owners must finish their profile (name + location) before they can publish listings. */
function requireCompleteProfile(req, res, next) {
  if (!req.user.profile_complete) {
    return next(new AppError(403, 'Please complete your profile first', 'PROFILE_INCOMPLETE'));
  }
  return next();
}

module.exports = {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  loadUser,
  requireAuth,
  requireRole,
  csrfGuard,
  requireCompleteProfile,
};
