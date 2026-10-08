'use strict';

const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

const MIN = 60 * 1000;

module.exports = {
  api: make(15 * MIN, 600, 'Too many requests. Please slow down.'),
  otpRequest: make(15 * MIN, 12, 'Too many OTP requests from this network. Please try again later.'),
  otpVerify: make(15 * MIN, 40, 'Too many verification attempts. Please try again later.'),
  adminLogin: make(15 * MIN, 10, 'Too many login attempts. Please try again later.'),
  passwordLogin: make(15 * MIN, 10, 'Too many login attempts. Please try again later.'),
  upload: make(15 * MIN, 60, 'Too many uploads. Please try again later.'),
};
