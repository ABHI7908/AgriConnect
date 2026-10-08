'use strict';

const { z } = require('zod');
const { normalizePhone } = require('./phone');

const phone = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, 'Enter a valid mobile number')
  .transform((v) => normalizePhone(v));

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

/** Trimmed, length-bounded text; empty string becomes undefined so optional fields stay clean. */
const text = (max, min = 0) =>
  z.preprocess(
    (v) => (v === null ? undefined : v),
    z
      .string()
      .trim()
      .max(max, `Must be at most ${max} characters`)
      .refine((v) => v.length === 0 || v.length >= min, `Must be at least ${min} characters`)
      .transform((v) => (v === '' ? undefined : v))
      .optional()
  );

const requiredText = (max, min = 2) =>
  z.string().trim().min(min, `Must be at least ${min} characters`).max(max, `Must be at most ${max} characters`);

/** Optional positive money amount. Accepts "" / null / undefined as "not set". */
const money = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0).max(10_000_000).optional()
);

/** Boolean that also understands multipart/form-data strings ("true", "1", "on"). */
const bool = z.preprocess((v) => {
  if (typeof v === 'string') return ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
  return v;
}, z.boolean());

const id = z.coerce.number().int().positive();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { phone, lat, lng, text, requiredText, money, bool, id, isoDate, pagination };
