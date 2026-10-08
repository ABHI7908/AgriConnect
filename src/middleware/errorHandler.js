'use strict';

const multer = require('multer');
const config = require('../config');
const { AppError } = require('../utils/errors');

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }
  return res.status(404).sendFile('404.html', { root: config.publicDir }, (err) => {
    if (err) res.status(404).type('text').send('Not found');
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Each image must be smaller than ${config.MAX_IMAGE_MB} MB`
        : err.code === 'LIMIT_FILE_COUNT'
          ? `You can upload at most ${config.MAX_IMAGES_PER_LISTING} images`
          : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_JSON';
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    status = 409;
    code = 'CONFLICT';
    message = 'This record already exists';
  }

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { notFoundHandler, errorHandler };
