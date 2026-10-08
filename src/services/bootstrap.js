'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const { DEFAULT_CROPS } = require('../constants');
const storage = require('./storage');

/** Insert the default crop list the first time only (admins can edit it afterwards). */
async function seedCrops() {
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM crops').get();
  if (n > 0) return;
  await db.transaction(async () => {
    for (const crop of DEFAULT_CROPS) {
      await db.prepare(
        'INSERT INTO crops (name, yield_per_acre_kg, default_price_per_quintal, notes) VALUES (?, ?, ?, ?)'
      ).run(crop.name, crop.kg, crop.price, crop.notes);
    }
  })();
}

/** Create or refresh the admin account from ADMIN_EMAIL / ADMIN_PASSWORD. */
async function ensureAdmin() {
  const email = (config.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = config.ADMIN_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin account will be created.');
    return;
  }
  if (password.length < 10) {
    // eslint-disable-next-line no-console
    console.error('ADMIN_PASSWORD must be at least 10 characters. Admin account was not created.');
    return;
  }

  const existing = await db.prepare("SELECT id, password_hash FROM users WHERE email = ? AND role = 'admin'").get(email);
  if (!existing) {
    await db.prepare(
      `INSERT INTO users (role, email, password_hash, name, profile_complete) VALUES ('admin', ?, ?, 'Administrator', 1)`
    ).run(email, bcrypt.hashSync(password, 12));
    return;
  }
  // Keep the stored hash in sync with the env value; bump token_version only if it actually changed.
  if (!bcrypt.compareSync(password, existing.password_hash)) {
    await db.prepare(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(bcrypt.hashSync(password, 12), existing.id);
  }
}

async function bootstrap() {
  await db.ready;
  const importedPhotos = await storage.migrateLegacyImages();
  if (importedPhotos) {
    // eslint-disable-next-line no-console
    console.log(`Imported ${importedPhotos} legacy listing photo(s) into PostgreSQL.`);
  }
  await seedCrops();
  await ensureAdmin();
}

module.exports = { bootstrap };
