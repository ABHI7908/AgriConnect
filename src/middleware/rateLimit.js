'use strict';

const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

const make = (windowMs, limit, message, options = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
    ...options,
  });

const MIN = 60 * 1000;
const loginKey = (identifierField) => (req) => {
  const identifier = String(req.body?.[identifierField] || '').trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${identifier}`;
};

module.exports = {
  // Authentication has dedicated, narrower limiters below. Exclude it from the
  // general API budget so normal page polling cannot prevent a user from signing in.
  api: make(15 * MIN, 600, 'Too many requests. Please slow down.', {
    skip: (req) => req.path === '/auth' || req.path.startsWith('/auth/'),
  }),
  otpRequest: make(15 * MIN, 12, 'Too many OTP requests from this network. Please try again later.'),
  otpVerify: make(15 * MIN, 40, 'Too many verification attempts. Please try again later.'),
  adminLogin: make(15 * MIN, 10, 'Too many login attempts for this account from this network. Please try again later.', {
    keyGenerator: loginKey('email'),
    skipSuccessfulRequests: true,
  }),
  passwordLogin: make(15 * MIN, 10, 'Too many login attempts for this account from this network. Please try again later.', {
    keyGenerator: loginKey('phone'),
    skipSuccessfulRequests: true,
  }),
  databaseManagerPasswordChange: make(15 * MIN, 10, 'Too many password changes from this network. Please try again later.'),
  upload: make(15 * MIN, 60, 'Too many uploads. Please try again later.'),
};
