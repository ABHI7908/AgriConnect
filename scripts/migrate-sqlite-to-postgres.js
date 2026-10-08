'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const db = require('../src/db');
const config = require('../src/config');

const TABLES = [
  'users',
  'otp_codes',
  'tools',
  'tool_images',
  'labour_listings',
  'bookings',
  'crops',
  'saved_calculations',
  'audit_logs',
];

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function run() {
  await db.ready;
  if (!fs.existsSync(config.sqliteSourcePath)) {
    throw new Error(`SQLite source database was not found: ${config.sqliteSourcePath}`);
  }

  const source = new Database(config.sqliteSourcePath, { readonly: true, fileMustExist: true });
  try {
    const sqliteTables = new Set(
      source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    const missing = TABLES.filter((table) => !sqliteTables.has(table));
    if (missing.length) throw new Error(`SQLite database is missing expected table(s): ${missing.join(', ')}`);

    for (const table of TABLES) {
      const { rows } = await db.query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
      if (Number(rows[0].count) !== 0) {
        throw new Error(`PostgreSQL table "${table}" is not empty; migration stopped without importing any rows.`);
      }
    }

    await db.transaction(async () => {
      for (const table of TABLES) {
        const sqliteRows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
        if (!sqliteRows.length) continue;
        const columns = Object.keys(sqliteRows[0]);
        const insert = db.prepare(
          `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`
        );
        for (const row of sqliteRows) {
          // eslint-disable-next-line no-await-in-loop
          await insert.run(...columns.map((column) => row[column]));
        }
        console.log(`Imported ${sqliteRows.length} row(s) from ${table}.`);
      }
    })();

    for (const table of TABLES) {
      await db.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), COUNT(*) > 0) FROM ${quoteIdentifier(table)}`
      );
    }
    console.log('SQLite data imported. The original SQLite file was left unchanged.');
  } finally {
    source.close();
    await db.close();
  }
}

run().catch((err) => {
  console.error('SQLite to PostgreSQL migration failed:', err.message);
  process.exitCode = 1;
});
