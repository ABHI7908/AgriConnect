'use strict';

const config = require('../config');

/**
 * Normalise user-entered phone numbers to E.164.
 *  - "9876543210"        -> "+919876543210" (default country code applied)
 *  - "+91 98765 43210"   -> "+919876543210"
 *  - "09876543210"       -> "+919876543210"
 * Returns null when the number is not plausible.
 */
function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (!s) return null;

  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (s.startsWith('+')) {
    if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
    if (s.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(s)) return null;
    return s;
  }

  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith('0')) s = s.slice(1);

  const cc = config.DEFAULT_COUNTRY_CODE;
  if (cc === '+91') {
    if (!/^[6-9]\d{9}$/.test(s)) return null;
    return `+91${s}`;
  }
  if (!/^\d{7,14}$/.test(s)) return null;
  return `${cc}${s}`;
}

function maskPhone(phone) {
  if (!phone) return phone;
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(0, phone.length - 6))}${phone.slice(-3)}`;
}

module.exports = { normalizePhone, maskPhone };
