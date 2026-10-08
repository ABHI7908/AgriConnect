'use strict';

const db = require('../db');

const insert = db.prepare(
  `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, meta, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

/**
 * Record an auditable event. Never throws: audit failures must not break a request.
 * @param {import('express').Request|null} req
 */
async function audit(req, action, { entity = null, entityId = null, meta = null, actor = null } = {}) {
  try {
    const who = actor || (req && req.user) || null;
    await insert.run(
      who ? who.id : null,
      who ? who.role : null,
      action,
      entity,
      entityId,
      meta ? JSON.stringify(meta).slice(0, 4000) : null,
      req ? req.ip : null
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('audit log failed', err.message);
  }
}

module.exports = { audit };
