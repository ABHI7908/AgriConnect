'use strict';

class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
  }
}

function defaultCode(status) {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHENTICATED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 429: return 'RATE_LIMITED';
    default: return 'INTERNAL_ERROR';
  }
}

const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
const unauthorized = (msg = 'Please log in to continue') => new AppError(401, msg);
const forbidden = (msg = 'You do not have access to this resource') => new AppError(403, msg);
const notFound = (msg = 'Not found') => new AppError(404, msg);
const conflict = (msg) => new AppError(409, msg);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
