'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('./config');
const db = require('./db');
const { TOOL_CATEGORIES, LABOUR_SKILLS } = require('./constants');
const { loadUser, csrfGuard } = require('./middleware/auth');
const limits = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/** CSP image source for a tile URL template, e.g. https://{s}.tile.x.org/{z}/{x}/{y}.png. */
function tileOrigin(template) {
  const url = new URL(template.replace('{s}', 'subdomain'));
  const host = url.host.startsWith('subdomain.') ? `*.${url.host.slice('subdomain.'.length)}` : url.host;
  return `${url.protocol}//${host}`;
}
const tileOrigins = [...new Set([tileOrigin(config.MAP_STREET_TILE_URL), tileOrigin(config.MAP_SAT_TILE_URL)])];

const app = express();

if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...tileOrigins],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use((req, res, next) => {
  // Geolocation is needed for "find near me" and GPS land measurement; everything else is off.
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
  next();
});

app.use(compression());
if (config.NODE_ENV !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

/* ----------------------------------------------------------- Health */

app.get('/healthz', async (req, res) => {
  try {
    await db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  } catch (err) {
    console.error('PostgreSQL health check failed', err.message);
    res.status(503).json({ status: 'degraded' });
  }
});

/* ----------------------------------------------------------- Static */

// Listing photos are stored as PostgreSQL BYTEA. Keep the old disk path as a fallback for legacy
// rows that could not be imported because their original file is missing.
app.get('/uploads/:filename', async (req, res, next) => {
  const filename = req.params.filename;
  if (!filename || filename !== path.basename(filename)) return next();
  const image = await db.prepare('SELECT mime, data FROM tool_images WHERE filename = ? AND data IS NOT NULL').get(filename);
  if (!image) return next();

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  return res.type(image.mime).send(image.data);
});

// Legacy uploaded photos: random file names, so they can be cached for a long time. Never executed or sniffed.
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    index: false,
    dotfiles: 'deny',
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    },
  })
);

app.use(
  '/vendor/leaflet',
  express.static(path.join(config.root, 'node_modules', 'leaflet', 'dist'), { maxAge: '7d', index: false })
);

app.use(
  express.static(config.publicDir, {
    extensions: ['html'],
    maxAge: config.isProd ? '1h' : 0,
    index: 'index.html',
    dotfiles: 'ignore',
  })
);

/* -------------------------------------------------------------- API */

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', cookieParser());
app.use('/api', loadUser);
app.use('/api', limits.api);
app.use('/api', csrfGuard);

app.get('/api/meta', (req, res) => {
  res.json({
    categories: TOOL_CATEGORIES,
    labourSkills: LABOUR_SKILLS,
    limits: {
      maxImages: config.MAX_IMAGES_PER_LISTING,
      maxImageMb: config.MAX_IMAGE_MB,
      otpLength: config.OTP_LENGTH,
    },
    listingsRequireApproval: config.LISTINGS_REQUIRE_APPROVAL,
    map: {
      street: { url: config.MAP_STREET_TILE_URL, attribution: config.MAP_STREET_ATTRIBUTION },
      satellite: { url: config.MAP_SAT_TILE_URL, attribution: config.MAP_SAT_ATTRIBUTION },
    },
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/labour', require('./routes/labour'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/communications', require('./routes/communications'));
app.use('/api/calculator', require('./routes/calculator'));
app.use('/api/admin', require('./routes/admin'));
if (config.dbManagerEnabled) {
  app.use('/api/database-manager', (req, res, next) => {
    const allowed = config.dbManagerAllowedIps;
    if (allowed.length && !allowed.includes(req.ip)) return notFoundHandler(req, res, next);
    return next();
  }, require('./routes/database-manager'));
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
