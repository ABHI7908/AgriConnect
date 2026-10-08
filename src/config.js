'use strict';

require('dotenv').config({ quiet: true });
const path = require('path');
const { z } = require('zod');

const bool = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000), // 0 = OS-assigned (tests)
  APP_URL: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  OTP_PEPPER: z.string().min(16, 'OTP_PEPPER must be at least 16 characters'),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().min(1).max(60).default(7),

  DATABASE_URL: z.string().url('DATABASE_URL must be a PostgreSQL connection URL'),
  DATABASE_SSL: bool(false),
  DATABASE_SSL_VERIFY: bool(true),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  SQLITE_SOURCE_PATH: z.string().optional().default('./data/agriconnect.db'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_IMAGES_PER_LISTING: z.coerce.number().int().min(1).max(20).default(6),
  MAX_IMAGE_MB: z.coerce.number().min(0.2).max(20).default(5),

  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(600).default(30),
  OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).max(50).default(6),
  DEFAULT_COUNTRY_CODE: z.string().regex(/^\+\d{1,3}$/).default('+91'),

  SMS_PROVIDER: z.enum(['console', 'twilio', 'msg91']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM: z.string().optional().default(''),
  MSG91_AUTH_KEY: z.string().optional().default(''),
  MSG91_TEMPLATE_ID: z.string().optional().default(''),

  MAP_STREET_TILE_URL: z.string().url().default('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'),
  MAP_STREET_ATTRIBUTION: z.string().default('&copy; OpenStreetMap contributors'),
  MAP_SAT_TILE_URL: z
    .string()
    .url()
    .default('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
  MAP_SAT_ATTRIBUTION: z.string().default('Imagery &copy; Esri, Maxar, Earthstar Geographics'),

  ADMIN_EMAIL: z.string().optional().default(''),
  ADMIN_PASSWORD: z.string().optional().default(''),
  DB_MANAGER_EMAIL: z.string().optional().default(''),
  DB_MANAGER_PASSWORD: z.string().optional().default(''),

  LISTINGS_REQUIRE_APPROVAL: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines.join('\n')}\n\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

if (isProd) {
  const problems = [];
  if (/change-me/i.test(env.JWT_SECRET)) problems.push('JWT_SECRET still has the placeholder value');
  if (/change-me/i.test(env.OTP_PEPPER)) problems.push('OTP_PEPPER still has the placeholder value');
  if (env.SMS_PROVIDER === 'console') problems.push('SMS_PROVIDER=console is not allowed in production');
  if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) {
    problems.push('Twilio credentials are incomplete');
  }
  if (env.SMS_PROVIDER === 'msg91' && !(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID)) {
    problems.push('MSG91 credentials are incomplete');
  }
  if (env.ADMIN_PASSWORD && /change/i.test(env.ADMIN_PASSWORD)) problems.push('ADMIN_PASSWORD still has the placeholder value');
  if (!env.DB_MANAGER_EMAIL || !env.DB_MANAGER_PASSWORD) {
    problems.push('DB_MANAGER_EMAIL and DB_MANAGER_PASSWORD are required');
  }
  if (env.DB_MANAGER_PASSWORD.length < 16) {
    problems.push('DB_MANAGER_PASSWORD must be at least 16 characters');
  }
  if (/change-me|change-this|replace-with|placeholder/i.test(env.DB_MANAGER_PASSWORD)) {
    problems.push('DB_MANAGER_PASSWORD still has a placeholder value');
  }
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
}

const root = path.resolve(__dirname, '..');

module.exports = Object.freeze({
  ...env,
  isProd,
  root,
  sqliteSourcePath: path.resolve(root, env.SQLITE_SOURCE_PATH),
  uploadDir: path.resolve(root, env.UPLOAD_DIR),
  publicDir: path.join(root, 'public'),
  maxImageBytes: Math.round(env.MAX_IMAGE_MB * 1024 * 1024),
  cookieName: 'agri_session',
});
