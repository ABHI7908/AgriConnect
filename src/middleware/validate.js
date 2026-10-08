'use strict';

const { AppError } = require('../utils/errors');

/**
 * validate({ body, query, params }) with zod schemas.
 * Parsed (and coerced / stripped) data is placed on req.valid.{body,query,params}.
 * Express 5 makes req.query read-only, so we never reassign the originals.
 */
function validate(schemas) {
  return (req, res, next) => {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          field: i.path.join('.') || part,
          message: i.message,
        }));
        const first = details[0];
        return next(
          new AppError(400, `${first.field}: ${first.message}`, 'VALIDATION_ERROR', details)
        );
      }
      req.valid[part] = result.data;
    }
    return next();
  };
}

module.exports = { validate };
