'use strict';

const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('./config');
const transactionContext = new AsyncLocalStorage();

types.setTypeParser(types.builtins.INT8, (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
});
// Keep DATE columns as 'YYYY-MM-DD' strings (no JS Date / timezone shifts).
types.setTypeParser(1082, (value) => value);

let pool;
if (config.NODE_ENV === 'test') {
  const testDatabase = import('@electric-sql/pglite').then(async ({ PGlite }) => {
    const database = new PGlite({ parsers: { 1082: (value) => value } });
    await database.waitReady;
    return database;
  });
  const client = async () => {
    const database = await testDatabase;
    return {
      query: (sql, values) => database.query(sql, values),
      release() {},
    };
  };
  pool = {
    connect: client,
    query: async (sql, values) => (await client()).query(sql, values),
    end: async () => (await testDatabase).close(),
    on() {},
  };
} else {
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: config.DATABASE_SSL_VERIFY } : undefined,
    max: config.DATABASE_POOL_SIZE,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Unexpected PostgreSQL pool error', err);
  });
}

function postgresSql(sql) {
  let out = sql
    .replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/date\('now',\s*'-13 days'\)/gi, "(CURRENT_DATE - INTERVAL '13 days')")
    .replace(/datetime\('now',\s*'-1 day'\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '1 day')")
    .replace(/GROUP_CONCAT\(DISTINCT\s+([^)]+)\)/gi, "STRING_AGG(DISTINCT $1, ',')");

  out = out.replace(/SUM\((\w+\.)?status\s*=\s*'([^']+)'\)/gi, "COUNT(*) FILTER (WHERE $1status = '$2')");

  let result = '';
  let parameter = 0;
  let single = false;
  let double = false;
  for (let i = 0; i < out.length; i += 1) {
    const ch = out[i];
    if (ch === "'" && !double) {
      result += ch;
      if (single && out[i + 1] === "'") {
        result += out[i + 1];
        i += 1;
      } else {
        single = !single;
      }
    } else if (ch === '"' && !single) {
      double = !double;
      result += ch;
    } else if (ch === '?' && !single && !double) {
      parameter += 1;
      result += `$${parameter}`;
    } else {
      result += ch;
    }
  }
  return result;
}

async function execute(sql, values) {
  await ready;
  const client = transactionContext.getStore();
  const result = await (client || pool).query(sql, values);
  if (result.rows) {
    result.rows = result.rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Uint8Array && !Buffer.isBuffer(value) ? Buffer.from(value) : value,
      ])
    ));
  }
  return result;
}

function prepare(sql) {
  const normalized = postgresSql(sql);
  return {
    async get(...values) {
      const { rows } = await execute(normalized, values);
      return rows[0];
    },
    async all(...values) {
      const { rows } = await execute(normalized, values);
      return rows;
    },
    async run(...values) {
      const isInsert = /^\s*INSERT\b/i.test(normalized);
      const statement = isInsert && !/\bRETURNING\b/i.test(normalized)
        ? `${normalized.replace(/;\s*$/, '')} RETURNING id`
        : normalized;
      const { rows, rowCount } = await execute(statement, values);
      return {
        changes: rowCount,
        lastInsertRowid: rows[0]?.id,
      };
    },
  };
}

function transaction(callback) {
  return async (...args) => {
    await ready;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionContext.run(client, () => callback(...args));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        // eslint-disable-next-line no-console
        console.error('PostgreSQL transaction rollback failed', rollbackError);
      });
      throw err;
    } finally {
      client.release();
    }
  };
}

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('farmer','owner','admin')),
    phone TEXT, email TEXT, password_hash TEXT, name TEXT, business_name TEXT,
    village TEXT, district TEXT, state TEXT, address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
    profile_complete INTEGER NOT NULL DEFAULT 0, token_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TIMESTAMPTZ
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone_role ON users(phone, role) WHERE phone IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email) WHERE email IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS ix_users_role_status ON users(role, status)',
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGSERIAL PRIMARY KEY, phone TEXT NOT NULL, role TEXT NOT NULL, code_hash TEXT NOT NULL,
    expires_at BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0,
    ip TEXT, created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS ix_otp_phone_role ON otp_codes(phone, role, created_at)',
  `CREATE TABLE IF NOT EXISTS tools (
    id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL, name TEXT NOT NULL, brand TEXT, model TEXT, year INTEGER, description TEXT,
    price_per_hour DOUBLE PRECISION, price_per_day DOUBLE PRECISION, price_per_acre DOUBLE PRECISION,
    with_operator INTEGER NOT NULL DEFAULT 0, village TEXT, district TEXT, state TEXT, address TEXT,
    lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
    service_radius_km DOUBLE PRECISION NOT NULL DEFAULT 25, available INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    admin_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS ix_tools_geo ON tools(status, available, lat, lng)',
  'CREATE INDEX IF NOT EXISTS ix_tools_owner ON tools(owner_id)',
  'CREATE INDEX IF NOT EXISTS ix_tools_category ON tools(category)',
  `CREATE TABLE IF NOT EXISTS tool_images (
    id BIGSERIAL PRIMARY KEY, tool_id BIGINT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, data BYTEA
  )`,
  'CREATE INDEX IF NOT EXISTS ix_tool_images_tool ON tool_images(tool_id, position)',
  `CREATE TABLE IF NOT EXISTS labour_listings (
    id BIGSERIAL PRIMARY KEY, provider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, skill TEXT NOT NULL, team_size INTEGER NOT NULL DEFAULT 1,
    wage_per_day DOUBLE PRECISION NOT NULL, description TEXT, village TEXT, district TEXT, state TEXT,
    address TEXT, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
    service_radius_km DOUBLE PRECISION NOT NULL DEFAULT 25, available INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    admin_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS ix_labour_geo ON labour_listings(status, available, lat, lng)',
  'CREATE INDEX IF NOT EXISTS ix_labour_provider ON labour_listings(provider_id)',
  `CREATE TABLE IF NOT EXISTS bookings (
    id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('tool','labour')),
    farmer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id BIGINT REFERENCES tools(id) ON DELETE SET NULL,
    labour_id BIGINT REFERENCES labour_listings(id) ON DELETE SET NULL,
    item_title TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, land_acres DOUBLE PRECISION,
    work_address TEXT, work_lat DOUBLE PRECISION, work_lng DOUBLE PRECISION, notes TEXT,
    quoted_amount DOUBLE PRECISION, final_amount DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','rejected','in_progress','completed','cancelled')),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5), review TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS ix_bookings_farmer ON bookings(farmer_id, created_at)',
  'CREATE INDEX IF NOT EXISTS ix_bookings_owner ON bookings(owner_id, created_at)',
  'CREATE INDEX IF NOT EXISTS ix_bookings_tool ON bookings(tool_id, status, start_date, end_date)',
  'CREATE INDEX IF NOT EXISTS ix_bookings_status ON bookings(status)',
  `CREATE TABLE IF NOT EXISTS crops (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, yield_per_acre_kg DOUBLE PRECISION NOT NULL,
    default_price_per_quintal DOUBLE PRECISION, notes TEXT, active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS saved_calculations (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL, crop TEXT NOT NULL, area_acres DOUBLE PRECISION NOT NULL,
    yield_per_acre_kg DOUBLE PRECISION NOT NULL, bag_weight_kg DOUBLE PRECISION NOT NULL,
    total_kg DOUBLE PRECISION NOT NULL, bags DOUBLE PRECISION NOT NULL,
    price_per_quintal DOUBLE PRECISION, revenue DOUBLE PRECISION, polygon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS ix_calc_user ON saved_calculations(user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY, actor_id BIGINT, actor_role TEXT, action TEXT NOT NULL,
    entity TEXT, entity_id BIGINT, meta TEXT, ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_logs(action, created_at)',
  'CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_logs(actor_id, created_at)',
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of schema) await client.query(statement);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const ready = migrate();

async function query(sql, ...values) {
  return execute(postgresSql(sql), values);
}

module.exports = {
  prepare,
  query,
  transaction,
  ready,
  close: () => pool.end(),
  pool,
};
