'use strict';

/**
 * Fills the database with demo owners, machines (with generated photos), labour teams, a farmer and a few bookings
 * so the app can be explored straight away.   npm run seed:demo
 * Refuses to run in production. Safe to run twice (skips if demo data already exists).
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../src/config');

if (config.isProd) {
  console.error('seed-demo refuses to run in production.');
  process.exit(1);
}

const db = require('../src/db');
const { bootstrap } = require('../src/services/bootstrap');
const storage = require('../src/services/storage');

/** Minimal solid-colour PNG with a diagonal band, so demo cards do not look empty. No image library needed. */
function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x += 1) {
      const band = Math.abs(x - y * (w / h) - w * 0.15) < w * 0.06;
      raw[o + 1 + x * 3] = band ? 242 : r;
      raw[o + 2 + x * 3] = band ? 169 : g;
      raw[o + 3 + x * 3] = band ? 0 : b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  await bootstrap();
  if (await db.prepare("SELECT 1 FROM users WHERE phone = '+919000000001'").get()) {
    console.log('Demo data already present. Nothing to do.');
    return;
  }

  const addUser = db.prepare(
    `INSERT INTO users (role, phone, name, business_name, village, district, state, lat, lng, profile_complete)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const owners = [];
  for (const owner of [
    ['+919000000001', 'Ravi Kumar', 'Sri Sai Agro Services', 'Shamshabad', 'Rangareddy', 'Telangana', 17.2403, 78.4294],
    ['+919000000002', 'Lakshmi Reddy', 'Reddy Farm Machinery', 'Medchal', 'Medchal', 'Telangana', 17.6296, 78.4813],
    ['+919000000003', 'Suresh Patil', 'Patil Drone Spraying', 'Sangareddy', 'Sangareddy', 'Telangana', 17.6199, 78.0867],
  ]) {
    owners.push((await addUser.run('owner', ...owner)).lastInsertRowid);
  }
  const farmerId = (await addUser.run('farmer', '+919100000001', 'Anil Goud', null, 'Keesara', 'Medchal', 'Telangana', 17.4, 78.55)).lastInsertRowid;

  const addTool = db.prepare(
    `INSERT INTO tools (owner_id, category, name, brand, model, year, description, price_per_hour, price_per_day, price_per_acre,
        with_operator, village, district, state, lat, lng, service_radius_km, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`
  );
  const addImg = db.prepare('INSERT INTO tool_images (tool_id, filename, mime, size_bytes, position) VALUES (?, ?, ?, ?, 0)');
  const tools = [
    [0, 'tractor', 'Mahindra 575 DI tractor', 'Mahindra', '575 DI', 2021, '45 HP, with rotavator and cultivator attachments.', 700, 5000, null, 1, [31, 90, 58]],
    [0, 'rotavator', 'Rotavator 7 ft', 'Shaktiman', 'Regular', 2022, 'Heavy-duty 7 ft rotavator for puddling and seed-bed prep.', null, 1800, 900, 0, [120, 85, 40]],
    [1, 'harvester', 'Combine harvester (paddy / wheat)', 'Kubota', 'DC-68G', 2020, 'Tracked combine, ideal for wet paddy fields.', 2200, null, 2200, 1, [45, 106, 159]],
    [1, 'tractor', 'Swaraj 744 FE', 'Swaraj', '744 FE', 2019, '48 HP with trolley.', 650, 4500, null, 1, [189, 59, 42]],
    [2, 'drone', 'Agri spraying drone (10 L)', 'DJI', 'Agras T10', 2023, 'Pesticide and foliar spray, about 8 acres per hour.', null, null, 450, 1, [20, 40, 30]],
    [2, 'sprayer', 'Power sprayer (Honda engine)', 'Honda', 'WJR2225', 2022, 'For orchards and tall crops.', 150, 900, null, 0, [90, 110, 70]],
  ];
  for (const t of tools) {
    const o = await db.prepare('SELECT * FROM users WHERE id = ?').get(owners[t[0]]);
    const id = (await addTool.run(o.id, t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], o.village, o.district, o.state,
      o.lat + (Math.random() - 0.5) * 0.02, o.lng + (Math.random() - 0.5) * 0.02, 30)).lastInsertRowid;
    const saved = await storage.saveImage(makePng(640, 480, t[11]), 'demo.png');
    await addImg.run(id, saved.filename, saved.mime, saved.size);
  }

  const addLab = db.prepare(
    `INSERT INTO labour_listings (provider_id, title, skill, team_size, wage_per_day, description, village, district, state, lat, lng, service_radius_km, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 25, 'approved')`
  );
  await addLab.run(owners[0], 'Paddy transplanting crew', 'sowing', 12, 450, 'Experienced women-led crew, 8 hour day.', 'Shamshabad', 'Rangareddy', 'Telangana', 17.25, 78.43);
  await addLab.run(owners[1], 'Harvesting and loading team', 'harvesting', 8, 500, 'Cotton picking and loading.', 'Medchal', 'Medchal', 'Telangana', 17.63, 78.48);

  const toolRow = await db.prepare("SELECT id, name, owner_id FROM tools WHERE name LIKE 'Mahindra%'").get();
  const addB = db.prepare(
    `INSERT INTO bookings (kind, farmer_id, owner_id, tool_id, item_title, start_date, end_date, land_acres, notes, quoted_amount, final_amount, status, completed_at)
     VALUES ('tool', ?, ?, ?, ?, ?, ?, 2, 'Ploughing before paddy sowing', 10000, 9500, ?, ?)`
  );
  await addB.run(farmerId, toolRow.owner_id, toolRow.id, toolRow.name, '2026-06-10', '2026-06-11', 'completed', '2026-06-11T12:00:00.000Z');

  console.log('Demo data created.');
  console.log('  Farmer login : 9100000001   (role: farmer)');
  console.log('  Owner login  : 9000000001   (role: owner)');
  console.log(`  Admin login  : ${config.ADMIN_EMAIL} / the ADMIN_PASSWORD in your .env`);
  console.log('  OTPs are printed in the server log while SMS_PROVIDER=console.');
  await db.close();
})().catch(async (e) => {
  console.error(e);
  await db.close();
  process.exitCode = 1;
});
