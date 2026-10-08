'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { badRequest } = require('../utils/errors');

fs.mkdirSync(config.uploadDir, { recursive: true });

/** Detect the real image type from magic bytes (the client-supplied mimetype is not trusted). */
function detectImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function saveImage(buffer, originalName = 'image') {
  const type = detectImage(buffer);
  if (!type) throw badRequest(`"${String(originalName).slice(0, 60)}" is not a valid JPEG, PNG or WebP image`);
  const filename = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
  return { filename, mime: type.mime, size: buffer.length, data: Buffer.from(buffer) };
}

async function migrateLegacyImages() {
  const pending = await db.prepare('SELECT id, filename, size_bytes FROM tool_images WHERE data IS NULL').all();
  const save = db.prepare('UPDATE tool_images SET data = ? WHERE id = ? AND data IS NULL');
  let migrated = 0;
  for (const image of pending) {
    if (!image.filename || image.filename !== path.basename(image.filename)) {
      throw new Error(`Unsafe legacy listing photo filename for image ${image.id}`);
    }
    const filePath = path.join(config.uploadDir, image.filename);
    if (!fs.existsSync(filePath)) {
      // Legacy rows may have already lost their local copy; leave them untouched and report the issue.
      console.warn(`Legacy listing photo ${image.id} is missing at ${filePath}; it was not imported.`);
      continue;
    }
    const data = fs.readFileSync(filePath);
    if (data.length !== image.size_bytes || !detectImage(data)) {
      throw new Error(`Legacy listing photo ${image.id} failed integrity validation; it was not imported.`);
    }
    const imported = (await save.run(data, image.id)).changes === 1;
    if (imported) {
      migrated += 1;
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Imported legacy listing photo ${image.id}, but could not remove its old file: ${err.message}`);
      }
    }
  }
  return migrated;
}

const urlFor = (filename) => `/uploads/${filename}`;

module.exports = { saveImage, migrateLegacyImages, urlFor, detectImage };
